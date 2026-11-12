"""Builds the full financial picture (forecasts + risk + summary) from the store."""
from __future__ import annotations

from ..database import Store
from ..models import Direction, ItemStatus, ScenarioIn
from .forecasting import apply_scenario, default_horizon_end, fmt, run_forecast
from .risk_detection import classify


def snapshot(store: Store) -> dict:
    p = store.get_profile()
    items = store.ledger()
    end = default_horizon_end(p.reference_date, items)
    base = run_forecast(p.opening_balance_minor, p.reference_date, items, "baseline", end)
    down = run_forecast(p.opening_balance_minor, p.reference_date, items, "downside", end)
    risk = classify(base, down, p.preferences.safety_buffer_minor)
    active = [i for i in items if i.status != ItemStatus.cancelled and i.date >= p.reference_date]
    incomes = [i for i in active if i.direction == Direction.income]
    confirmed_in = sum(i.amount_minor for i in incomes if i.status == ItemStatus.confirmed)
    expected_in = sum(i.amount_minor for i in incomes if i.status != ItemStatus.confirmed)
    essentials = sum(i.amount_minor for i in active if i.direction == Direction.expense and i.essential)
    next_pay = min(incomes, key=lambda i: i.date, default=None)
    return {
        "user": {"id": p.id, "name": p.name},
        "currency": p.currency,
        "reference_date": p.reference_date.isoformat(),
        "balance_as_of": p.balance_as_of.isoformat(),
        "current_balance_minor": p.opening_balance_minor,
        "confirmed_income_minor": confirmed_in,
        "expected_unconfirmed_income_minor": expected_in,
        "expected_income_minor": confirmed_in + expected_in,
        "essential_payments_minor": essentials,
        "projected_end_minor": base.closing_minor,
        "balance_at_critical_minor": base.balance_at_critical_minor,
        "downside_balance_at_critical_minor": down.balance_at_critical_minor,
        "critical_payment": base.critical_payment,
        "next_payday": ({"date": next_pay.date.isoformat(), "label": next_pay.label,
                         "amount_minor": sum(i.amount_minor for i in incomes if i.date == next_pay.date)}
                        if next_pay else None),
        "first_negative_date": base.first_negative_date.isoformat() if base.first_negative_date else None,
        "min_balance_minor": base.min_balance_minor,
        "min_balance_date": base.min_balance_date.isoformat(),
        "risk": risk,
        "forecast": base,
        "downside": down,
        "data_note": ("Forecast uses the balance as of the time shown plus the payments and income in "
                      "your plan. Bridge has no history of past pay for this account yet, so it shows a "
                      "simple range (confirmed income only vs. everything expected) rather than "
                      "statistical confidence intervals."),
    }


def summary(store: Store) -> dict:
    s = snapshot(store)
    s = {k: v for k, v in s.items() if k not in ("forecast", "downside")}
    return s


def simulate(store: Store, scenario: ScenarioIn) -> dict:
    p = store.get_profile()
    items = store.ledger()
    end = default_horizon_end(p.reference_date, items)
    original = run_forecast(p.opening_balance_minor, p.reference_date, items, "baseline", end)
    changed, change_text = apply_scenario(items, p.reference_date, scenario)
    end2 = max(end, default_horizon_end(p.reference_date, changed))
    original = run_forecast(p.opening_balance_minor, p.reference_date, items, "baseline", end2)
    updated = run_forecast(p.opening_balance_minor, p.reference_date, changed, "what_if", end2)

    o, u = original.balance_at_critical_minor, updated.balance_at_critical_minor
    crit = original.critical_payment
    diff = (u or 0) - (o or 0)
    parts = [f"If {change_text}:"]
    if crit:
        if u == o:
            parts.append(f"on {_d(crit['date'])}, when your {crit['label'].lower()} is due, your projected "
                         f"balance would stay at {fmt(u)}.")
        else:
            parts.append(f"on {_d(crit['date'])}, when your {crit['label'].lower()} is due, your projected "
                         f"balance would be {fmt(u)} instead of {fmt(o)}.")
    else:
        parts.append(f"your projected balance at the end would be {fmt(updated.closing_minor)} "
                     f"instead of {fmt(original.closing_minor)}.")

    # Timing check: income added/moved after the critical date does not prevent that shortfall.
    timing_warning = None
    if crit and scenario.type in ("extra_income", "delay_income"):
        before_keys = {(x.id, x.date) for x in items}
        added_after = any(
            i.direction == Direction.income and i.status != ItemStatus.cancelled
            and (i.id, i.date) not in before_keys and i.date.isoformat() > crit["date"]
            for i in changed)
        if added_after:
            timing_warning = (f"This money would arrive after {crit['label'].lower()} is due on "
                              f"{_d(crit['date'])}, so it would not prevent a shortfall on that date.")
            parts.append(timing_warning)
    if u is not None and u < 0:
        parts.append(f"That would still be {fmt(-u)} short.")
    elif u is not None and o is not None and o < 0 <= u:
        parts.append("That would cover the listed payments, but leave very little room for anything unexpected."
                     if u < p.preferences.safety_buffer_minor else "That would cover the listed payments.")
    if scenario.type == "extra_income":
        parts.append("This depends on the extra work actually being available and paid in time.")

    return {
        "scenario": scenario.model_dump(mode="json"),
        "change": change_text,
        "original": original,
        "updated": updated,
        "original_balance_at_critical_minor": o,
        "updated_balance_at_critical_minor": u,
        "difference_minor": diff,
        "first_shortfall_date": updated.first_negative_date.isoformat() if updated.first_negative_date else None,
        "affected_essentials": updated.uncovered_essentials,
        "timing_warning": timing_warning,
        "explanation": " ".join(parts),
    }


def _d(iso: str) -> str:
    from datetime import date
    return f"{date.fromisoformat(iso).day} {date.fromisoformat(iso):%B}"
