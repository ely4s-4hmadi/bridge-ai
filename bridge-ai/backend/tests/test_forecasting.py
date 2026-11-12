"""Unit tests for Runway — the deterministic forecasting engine."""
from datetime import date

import pytest

from app.models import Direction, ItemStatus, LedgerItem, ScenarioIn
from app.seed import amira
from app.services.forecasting import ScenarioError, apply_scenario, fmt, run_forecast
from app.services.risk_detection import classify

REF = amira.REFERENCE_DATE
OPEN = 21000


def ledger(shift_cancelled=False, electricity=3500):
    items = amira.ledger()
    for i in items:
        if shift_cancelled and i.shift_id == "shift_2026_11_21":
            i.status = ItemStatus.cancelled
        if i.bill_id == "bill_electricity_nov":
            i.amount_minor = electricity
    return items


def at_rent(items):
    f = run_forecast(OPEN, REF, items)
    return f.balance_at_critical_minor


def test_original_amira_is_30():
    f = run_forecast(OPEN, REF, ledger())
    assert f.balance_at_critical_minor == 3000
    assert f.total_income_minor == 39000 and f.total_outgoing_minor == 57000
    assert f.first_negative_date is None


def test_cancelled_shift_is_minus_60():
    assert at_rent(ledger(shift_cancelled=True)) == -6000


def test_both_shocks_minus_85_on_1_december():
    f = run_forecast(OPEN, REF, ledger(True, 6000))
    assert f.balance_at_critical_minor == -8500
    assert f.first_negative_date == date(2026, 12, 1)
    assert f.critical_payment["category"] == "rent"
    assert f.uncovered_essentials == [{"id": "exp_rent", "label": "Rent", "date": "2026-12-01",
                                       "amount_minor": 45000, "shortfall_minor": 8500}]


def test_daily_balances_follow_the_ledger():
    f = run_forecast(OPEN, REF, ledger(True, 6000))
    closing = {d.date: d.closing_minor for d in f.days}
    assert closing[date(2026, 11, 15)] == 17500
    assert closing[date(2026, 11, 17)] == 15500
    assert closing[date(2026, 11, 22)] == 9500
    assert closing[date(2026, 11, 24)] == 6500
    assert closing[date(2026, 11, 28)] == 36500
    assert closing[date(2026, 12, 1)] == -8500


def test_what_if_30_purchase_after_shocks_is_minus_115():
    items, _ = apply_scenario(ledger(True, 6000), REF,
                              ScenarioIn(type="extra_expense", amount_minor=3000, date=date(2026, 11, 8)))
    assert at_rent(items) == -11500


def test_what_if_extra_100_before_rent_is_15():
    items, _ = apply_scenario(ledger(True, 6000), REF, ScenarioIn(type="extra_income", amount_minor=10000))
    assert at_rent(items) == 1500


def test_extra_income_after_rent_does_not_prevent_shortfall():
    items, _ = apply_scenario(ledger(True, 6000), REF,
                              ScenarioIn(type="extra_income", amount_minor=10000, date=date(2026, 12, 3)))
    f = run_forecast(OPEN, REF, items)
    assert f.balance_at_critical_minor == -8500
    assert f.first_negative_date == date(2026, 12, 1)
    assert f.closing_minor == 1500  # recovers later, but too late for rent


def test_what_if_never_mutates_base_case():
    base = ledger(True, 6000)
    apply_scenario(base, REF, ScenarioIn(type="extra_expense", amount_minor=3000))
    assert at_rent(base) == -8500


def test_delayed_wages_past_rent():
    items, _ = apply_scenario(ledger(True, 6000), REF, ScenarioIn(type="delay_income", days=5))
    f = run_forecast(OPEN, REF, items)
    assert f.balance_at_critical_minor == 6500 - 45000


def test_bill_change_and_lose_shift_scenarios():
    items, _ = apply_scenario(ledger(), REF, ScenarioIn(type="bill_change", item_id="exp_electricity", amount_minor=2000))
    assert at_rent(items) == 1000
    items, _ = apply_scenario(ledger(), REF, ScenarioIn(type="remove_shift"))
    assert at_rent(items) == -6000
    # With no separate shift left, "lose another shift" reduces the next pay
    items, _ = apply_scenario(ledger(True, 6000), REF, ScenarioIn(type="remove_shift", amount_minor=9000))
    assert at_rent(items) == -17500


def test_negative_balance_and_zero_income():
    items = [i for i in ledger() if i.direction == Direction.expense]
    f = run_forecast(OPEN, REF, items)
    assert f.balance_at_critical_minor == 21000 - 57000
    assert f.first_negative_date == date(2026, 12, 1)
    assert f.total_income_minor == 0


def test_items_before_reference_date_not_double_counted():
    items = ledger() + [LedgerItem(id="old", direction=Direction.expense, category="phone", label="Old bill",
                                   amount_minor=5000, date=date(2026, 11, 1), essential=True)]
    assert at_rent(items) == 3000


def test_downside_uses_confirmed_income_only_and_risk_rules():
    items = ledger()
    base = run_forecast(OPEN, REF, items)
    down = run_forecast(OPEN, REF, items, "downside")
    assert down.balance_at_critical_minor == -6000
    r = classify(base, down, 5000)
    assert r["status"] == "amber"
    assert set(r["rules_triggered"]) == {"below_safety_buffer", "downside_below_zero"}
    shocked = ledger(True, 6000)
    r = classify(run_forecast(OPEN, REF, shocked), run_forecast(OPEN, REF, shocked, "downside"), 5000)
    assert r["status"] == "red"
    roomy = run_forecast(100000, REF, items)
    assert classify(roomy, run_forecast(100000, REF, items, "downside"), 5000)["status"] == "green"


def test_currency_precision_pence():
    items = [LedgerItem(id=f"c{n}", direction=Direction.expense, category="x", label="x", amount_minor=1,
                        date=date(2026, 11, 10)) for n in range(10)]
    f = run_forecast(10, REF, items)  # 10p minus ten 1p payments is exactly zero
    assert f.closing_minor == 0
    with pytest.raises(TypeError):
        run_forecast(10.0, REF, items)  # floats are refused
    assert fmt(-8500) == "−£85" and fmt(1550) == "£15.50" and fmt(3000) == "£30"


def test_invalid_scenarios_are_rejected():
    with pytest.raises(ScenarioError):
        apply_scenario(ledger(), REF, ScenarioIn(type="extra_expense"))
    with pytest.raises(ScenarioError):
        apply_scenario(ledger(), REF, ScenarioIn(type="change_payment_date", item_id="nope", date=date(2026, 12, 2)))
