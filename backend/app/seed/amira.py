"""Fictional demo persona. Every value here is invented for the hackathon demo."""
from datetime import date, datetime, timezone

from ..models import Direction, ItemStatus, LedgerItem, UserPreferences, UserProfile

REFERENCE_DATE = date(2026, 11, 7)
USER_ID = "user_amira"


def profile() -> UserProfile:
    return UserProfile(
        id=USER_ID, name="Amira", age=23, location="Manchester, United Kingdom",
        occupation="International university student, part-time hospitality work",
        currency="GBP", reference_date=REFERENCE_DATE, opening_balance_minor=21000,
        balance_as_of=datetime(2026, 11, 7, 9, 0, tzinfo=timezone.utc),
        preferences=UserPreferences(),
    )


def ledger() -> list[LedgerItem]:
    E, I = Direction.expense, Direction.income
    src = "demo_seed (fictional)"
    return [
        LedgerItem(id="exp_groceries_1", direction=E, category="groceries", label="Groceries",
                   amount_minor=3500, date=date(2026, 11, 15), essential=True, source=src),
        LedgerItem(id="exp_phone", direction=E, category="phone", label="Phone bill",
                   amount_minor=2000, date=date(2026, 11, 17), essential=True, source=src, bill_id="bill_phone"),
        LedgerItem(id="exp_electricity", direction=E, category="electricity", label="Electricity bill",
                   amount_minor=3500, date=date(2026, 11, 22), essential=True, source=src,
                   bill_id="bill_electricity_nov"),
        LedgerItem(id="exp_groceries_2", direction=E, category="groceries", label="Groceries",
                   amount_minor=3000, date=date(2026, 11, 24), essential=True, source=src),
        LedgerItem(id="inc_wages_core", direction=I, category="wages",
                   label="Wages for hours already worked", amount_minor=30000, date=date(2026, 11, 28),
                   status=ItemStatus.confirmed, source=src,
                   note="Hours already worked this pay period (timesheet approved)."),
        LedgerItem(id="inc_shift_s1", direction=I, category="shift", label="Saturday shift (21 Nov)",
                   amount_minor=9000, date=date(2026, 11, 28), status=ItemStatus.expected, source=src,
                   shift_id="shift_2026_11_21", note="Rota shift, paid on 28 Nov if worked."),
        LedgerItem(id="exp_rent", direction=E, category="rent", label="Rent",
                   amount_minor=45000, date=date(2026, 12, 1), essential=True, source=src, bill_id="bill_rent_dec"),
    ]
