"""Runway — Bridge AI's deterministic cash-flow forecasting engine.

Rules (all documented, all tested):

* Money is integer pence. No floating point anywhere.
* The opening balance is the account balance at the start of the reference
  date. Items dated before the reference date are assumed already settled
  (included in the balance) and are ignored, so nothing is double counted.
* closing(d) = closing(d-1) + income(d) - payments(d)
* Cancelled items never count.
* The "critical payment" is the first essential housing payment (rent) in the
  horizon; if there is none, the largest essential payment.
* An essential payment is "uncovered" if the closing balance on its due date
  is below zero; the uncovered amount is min(amount, -closing).
"""
from __future__ import annotations

import copy
from datetime import date, timedelta
from typing import Iterable, Optional

from ..models import Direction, Forecast, ForecastDay, ItemStatus, LedgerItem, ScenarioIn


def _active(items: Iterable[LedgerItem]) -> list[LedgerItem]:
    return [i for i in items if i.status != ItemStatus.cancelled]


def find_critical_payment(items: list[LedgerItem], start: date, end: date) -> Optional[LedgerItem]:
    essentials = [
        i for i in _active(items)
        if i.direction == Direction.expense and i.essential and start <= i.date <= end
    ]
    rents = sorted([i for i in essentials if i.category == "rent"], key=lambda i: i.date)
    if rents:
        return rents[0]
    if essentials:
        return sorted(essentials, key=lambda i: (-i.amount_minor, i.date))[0]
    return None


def default_horizon_end(reference: date, items: list[LedgerItem]) -> date:
    """Forecast at least 30 days ahead and always past the last scheduled item."""
    latest = max((i.date for i in _active(items)), default=reference)
    return max(reference + timedelta(days=30), latest)


def run_forecast(
    opening_minor: int,
    reference: date,
    items: list[LedgerItem],
    scenario: str = "baseline",
    horizon_end: Optional[date] = None,
) -> Forecast:
    if not isinstance(opening_minor, int):
        raise TypeError("opening_minor must be an integer number of pence")
    active = _active(items)
    if scenario in ("downside", "confirmed_only"):
        active = [
            i for i in active
            if not (i.direction == Direction.income and i.status != ItemStatus.confirmed)
        ]
    end = horizon_end or default_horizon_end(reference, items)

    by_day: dict[date, list[LedgerItem]] = {}
    for item in active:
        if reference <= item.date <= end:
            by_day.setdefault(item.date, []).append(item)

    days: list[ForecastDay] = []
    balance = opening_minor
    min_bal, min_date = opening_minor, reference
    first_negative: Optional[date] = None
    total_in = total_out = 0
    d = reference
    while d <= end:
        todays = sorted(by_day.get(d, []), key=lambda i: (i.direction != Direction.income, i.id))
        inc = sum(i.amount_minor for i in todays if i.direction == Direction.income)
        out = sum(i.amount_minor for i in todays if i.direction == Direction.expense)
        opening = balance
        balance = balance + inc - out
        total_in += inc
        total_out += out
        if balance < min_bal:
            min_bal, min_date = balance, d
        if balance < 0 and first_negative is None:
            first_negative = d
        days.append(ForecastDay(
            date=d, opening_minor=opening, income_minor=inc, outgoing_minor=out,
            closing_minor=balance,
            items=[{
                "id": i.id, "label": i.label, "category": i.category,
                "direction": i.direction.value, "amount_minor": i.amount_minor,
                "status": i.status.value, "essential": i.essential, "source": i.source,
            } for i in todays],
        ))
        d += timedelta(days=1)

    closing_by_date = {fd.date: fd.closing_minor for fd in days}
    uncovered = []
    for item in sorted(active, key=lambda i: i.date):
        if item.direction == Direction.expense and item.essential and reference <= item.date <= end:
            c = closing_by_date[item.date]
            if c < 0:
                uncovered.append({
                    "id": item.id, "label": item.label, "date": item.date.isoformat(),
                    "amount_minor": item.amount_minor,
                    "shortfall_minor": min(item.amount_minor, -c),
                })

    critical = find_critical_payment(items, reference, end)
    return Forecast(
        scenario=scenario, reference_date=reference, horizon_end=end,
        opening_minor=opening_minor, days=days, closing_minor=balance,
        min_balance_minor=min_bal, min_balance_date=min_date,
        first_negative_date=first_negative,
        critical_payment=(
            {"id": critical.id, "label": critical.label, "date": critical.date.isoformat(),
             "amount_minor": critical.amount_minor, "category": critical.category}
            if critical else None),
        balance_at_critical_minor=closing_by_date.get(critical.date) if critical else None,
        uncovered_essentials=uncovered,
        total_income_minor=total_in, total_outgoing_minor=total_out,
    )


# --------------------------------------------------------------------------
# What-if scenarios (always applied to a deep copy — base case never changes)
# --------------------------------------------------------------------------

class ScenarioError(ValueError):
    pass


def _next_income(items: list[LedgerItem], reference: date) -> Optional[LedgerItem]:
    inc = [i for i in _active(items) if i.direction == Direction.income and i.date >= reference]
    return sorted(inc, key=lambda i: (i.date, -i.amount_minor))[0] if inc else None


def apply_scenario(items: list[LedgerItem], reference: date, s: ScenarioIn) -> tuple[list[LedgerItem], str]:
    """Return (modified copy of items, short description of the change)."""
    new = copy.deepcopy(items)
    active = _active(new)

    def need_amount() -> int:
        if s.amount_minor is None or s.amount_minor <= 0:
            raise ScenarioError("This scenario needs a positive amount.")
        return s.amount_minor

    def find(item_id: Optional[str]) -> LedgerItem:
        for i in active:
            if i.id == item_id:
                return i
        raise ScenarioError(f"No active item with id '{item_id}'.")

    if s.type == "extra_expense":
        amt = need_amount()
        when = s.date or reference
        new.append(LedgerItem(id="whatif_expense", direction=Direction.expense, category="discretionary",
                              label=s.label or "Hypothetical spending", amount_minor=amt, date=when,
                              status=ItemStatus.expected, essential=False, source="what_if"))
        return new, f"you spend {fmt(amt)} on {when.day} {when:%B}"

    if s.type == "extra_income":
        amt = need_amount()
        nxt = _next_income(new, reference)
        when = s.date or (nxt.date if nxt else reference)
        new.append(LedgerItem(id="whatif_income", direction=Direction.income, category="shift",
                              label=s.label or "Hypothetical extra shift", amount_minor=amt, date=when,
                              status=ItemStatus.expected, source="what_if"))
        return new, f"you receive an extra {fmt(amt)} on {when.day} {when:%B}"

    if s.type == "remove_shift":
        target = find(s.item_id) if s.item_id else None
        if target is None:
            shifts = [i for i in active if i.direction == Direction.income and i.category == "shift"]
            if shifts:
                target = sorted(shifts, key=lambda i: i.date)[0]
        if target is not None:
            target.status = ItemStatus.cancelled
            return new, f"you lose the {target.label.lower()} ({fmt(target.amount_minor)})"
        # No separate shift left: model as a reduction to the next pay.
        s = s.model_copy(update={"type": "reduce_income", "amount_minor": s.amount_minor or 9000})

    if s.type == "reduce_income":
        amt = need_amount()
        target = find(s.item_id) if s.item_id else _next_income(new, reference)
        if target is None:
            raise ScenarioError("There is no expected income to reduce.")
        cut = min(amt, target.amount_minor)
        target.amount_minor -= cut
        return new, f"you earn {fmt(cut)} less on {target.date.day} {target.date:%B}"

    if s.type == "bill_change":
        if s.amount_minor is None:
            raise ScenarioError("Give the amount the bill changes by.")
        target = find(s.item_id) if s.item_id else None
        if target is None:
            raise ScenarioError("Choose which bill changes.")
        target.amount_minor += s.amount_minor
        return new, f"your {target.label.lower()} goes up by {fmt(s.amount_minor)}"

    if s.type == "delay_income":
        days = s.days if s.days is not None else 3
        target = find(s.item_id) if s.item_id else _next_income(new, reference)
        if target is None:
            raise ScenarioError("There is no expected income to delay.")
        target.date = target.date + timedelta(days=days)
        return new, f"the payment “{target.label}” arrives {days} days late, on {target.date.day} {target.date:%B}"

    if s.type == "change_payment_date":
        target = find(s.item_id)
        if s.date is None:
            raise ScenarioError("Give the new payment date.")
        target.date = s.date
        return new, f"your {target.label.lower()} moves to {s.date.day} {s.date:%B}"

    raise ScenarioError(f"Unsupported scenario type {s.type}")


def fmt(minor: int) -> str:
    """Format pence as £ with a real minus sign: -8500 -> '−£85', 1550 -> '£15.50'."""
    sign = "−" if minor < 0 else ""
    pounds, pence = divmod(abs(minor), 100)
    return f"{sign}£{pounds:,}" + (f".{pence:02d}" if pence else "")
