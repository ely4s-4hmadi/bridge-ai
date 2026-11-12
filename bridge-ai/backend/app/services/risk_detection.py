"""Transparent, rule-based risk classification.

RED   "Shortfall predicted": the baseline forecast goes below £0 at any point,
      or an essential payment is not covered.
AMBER "At risk": baseline never goes below £0 BUT
        (a) the lowest projected balance is below the user's own safety
            buffer (shown in Settings, default £50), or
        (b) the downside forecast (only confirmed income arrives) goes below £0.
GREEN "On track": none of the above.

The colour is a forecast of cash flow, never a credit score or a judgement.
"""
from __future__ import annotations

from ..models import Forecast
from .forecasting import fmt


def classify(baseline: Forecast, downside: Forecast, buffer_minor: int) -> dict:
    reasons: list[str] = []
    rules_triggered: list[str] = []

    if baseline.first_negative_date or baseline.uncovered_essentials:
        status = "red"
        rules_triggered.append("baseline_below_zero")
        d = baseline.first_negative_date
        reasons.append(
            f"Your forecast drops to {fmt(baseline.min_balance_minor)} on {d.day} {d:%B}."
            if d else "An essential payment may not be covered.")
        for u in baseline.uncovered_essentials:
            reasons.append(f"{u['label']} ({fmt(u['amount_minor'])} on {_day(u['date'])}) may be "
                           f"{fmt(u['shortfall_minor'])} short.")
    else:
        status = "green"
        if baseline.min_balance_minor < buffer_minor:
            status = "amber"
            rules_triggered.append("below_safety_buffer")
            reasons.append(
                f"Your lowest projected balance is {fmt(baseline.min_balance_minor)} on "
                f"{baseline.min_balance_date.day} {baseline.min_balance_date:%B}, below your {fmt(buffer_minor)} safety buffer.")
        if downside.first_negative_date:
            status = "amber"
            rules_triggered.append("downside_below_zero")
            reasons.append(
                f"If income that isn't confirmed yet doesn't arrive, you could reach "
                f"{fmt(downside.min_balance_minor)} on {downside.first_negative_date.day} {downside.first_negative_date:%B}.")
        if status == "green":
            reasons.append("No shortfall is forecast for the payments you've entered.")

    label = {"red": "Shortfall predicted", "amber": "At risk", "green": "On track"}[status]
    return {
        "status": status,
        "label": label,
        "reasons": reasons,
        "rules_triggered": rules_triggered,
        "safety_buffer_minor": buffer_minor,
        "explanation": ("This colour is a forecast based on the payments and income you've entered. "
                        "It is not a credit score and not a judgement about you."),
        "rules": {
            "red": "Forecast goes below £0, or an essential payment isn't covered.",
            "amber": f"Lowest balance is under your {fmt(buffer_minor)} safety buffer, or the "
                     "confirmed-income-only forecast goes below £0.",
            "green": "No shortfall and you stay above your safety buffer.",
        },
    }


def _day(iso: str) -> str:
    from datetime import date
    return f"{date.fromisoformat(iso).day} {date.fromisoformat(iso):%B}"
