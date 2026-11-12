"""Applies real-world financial events (from n8n or the local simulator) to the ledger.

Guarantees:
* Idempotent: an event_id is processed at most once (duplicates are reported, not re-applied).
* Every change keeps provenance (source, via, timestamp) on the affected ledger item.
* Forecast and risk are recalculated after every change; an alert is raised if risk changed.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from ..database import Store
from ..models import Direction, FinancialEventIn, ItemStatus, LedgerItem
from .forecasting import fmt


class EventError(ValueError):
    pass


def _find(items: list[LedgerItem], pred: Callable[[LedgerItem], bool]) -> LedgerItem | None:
    return next((i for i in items if pred(i)), None)


def process_event(store: Store, ev: FinancialEventIn, via: str, snapshot: Callable[[], dict]) -> dict:
    """via is 'n8n' when the request was delivered by an n8n workflow, else 'local_simulation'."""
    if store.event_exists(ev.event_id):
        return {"status": "duplicate", "event_id": ev.event_id,
                "message": "Event already processed; nothing changed."}

    profile = store.get_profile()
    if ev.user_id != profile.id:
        raise EventError("Unknown user_id")

    before = snapshot()
    items = store.ledger()
    now = datetime.now(timezone.utc)
    provenance = f"{ev.source} via {via}"

    if ev.event_type == "shift_cancelled":
        if not ev.shift_id:
            raise EventError("shift_cancelled requires shift_id")
        item = _find(items, lambda i: i.shift_id == ev.shift_id)
        if item is None:
            raise EventError(f"No scheduled shift {ev.shift_id}")
        if item.status == ItemStatus.cancelled:
            raise EventError(f"Shift {ev.shift_id} is already cancelled")
        if ev.amount_minor is not None and ev.amount_minor != item.amount_minor:
            raise EventError("amount_minor does not match the scheduled shift")
        item.status = ItemStatus.cancelled
        summary = f"Shift cancelled: expected pay reduced by {fmt(item.amount_minor)}."

    elif ev.event_type == "bill_updated":
        if not ev.bill_id or ev.new_amount_minor is None:
            raise EventError("bill_updated requires bill_id and new_amount_minor")
        item = _find(items, lambda i: i.bill_id == ev.bill_id and i.status != ItemStatus.cancelled)
        if item is None:
            raise EventError(f"No bill {ev.bill_id}")
        if ev.old_amount_minor is not None and ev.old_amount_minor != item.amount_minor:
            raise EventError("old_amount_minor does not match the current bill amount")
        diff = ev.new_amount_minor - item.amount_minor
        old = item.amount_minor
        item.amount_minor = ev.new_amount_minor
        if ev.due_date:
            item.date = ev.due_date
        summary = (f"{item.label} updated from {fmt(old)} to {fmt(item.amount_minor)} "
                   f"({'+' if diff >= 0 else ''}{fmt(diff)}).")

    elif ev.event_type == "income_delayed":
        if not ev.new_date:
            raise EventError("income_delayed requires new_date")
        item = _find(items, lambda i: i.direction == Direction.income and i.status != ItemStatus.cancelled
                     and (ev.shift_id is None or i.shift_id == ev.shift_id))
        if item is None:
            raise EventError("No expected income to delay")
        old_date = item.date
        item.date = ev.new_date
        summary = f"{item.label} moved from {old_date.day} {old_date:%B} to {item.date.day} {item.date:%B}."

    elif ev.event_type in ("new_bill", "shift_added"):
        if ev.amount_minor is None or not (ev.due_date or ev.event_date):
            raise EventError(f"{ev.event_type} requires amount_minor and due_date")
        is_bill = ev.event_type == "new_bill"
        item = LedgerItem(
            id=f"{'exp' if is_bill else 'inc'}_{ev.event_id}",
            direction=Direction.expense if is_bill else Direction.income,
            category="bill" if is_bill else "shift",
            label=ev.label or ("New bill" if is_bill else "Extra shift"),
            amount_minor=ev.amount_minor, date=ev.due_date or ev.event_date,
            status=ItemStatus.expected, essential=is_bill, bill_id=ev.bill_id, shift_id=ev.shift_id,
        )
        items.append(item)
        summary = f"{item.label} of {fmt(item.amount_minor)} added for {item.date.day} {item.date:%B}."
    else:  # pragma: no cover - guarded by the Literal type
        raise EventError("Unsupported event_type")

    item.source = provenance
    item.updated_at = now
    store.save_item(item)

    after = snapshot()
    result = {
        "status": "processed", "event_id": ev.event_id, "via": via, "summary": summary,
        "affected_item": item.id,
        "before": {"balance_at_critical_minor": before["balance_at_critical_minor"], "risk": before["risk"]},
        "after": {"balance_at_critical_minor": after["balance_at_critical_minor"], "risk": after["risk"]},
        "change_minor": (after["balance_at_critical_minor"] or 0) - (before["balance_at_critical_minor"] or 0),
    }
    store.record_event(ev.event_id, ev.event_type, ev.source, via,
                       ev.model_dump(mode="json"), result, "processed")
    return result
