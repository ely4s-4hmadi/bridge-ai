"""Typed domain models for Bridge AI.

All money is stored as integer minor units (pence). No floats are used in
any financial calculation.
"""
from __future__ import annotations

import datetime as dt
from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Direction(str, Enum):
    income = "income"
    expense = "expense"


class ItemStatus(str, Enum):
    confirmed = "confirmed"      # e.g. hours already worked / payslip issued
    expected = "expected"        # scheduled but not guaranteed (future shift)
    cancelled = "cancelled"      # removed by an event (kept for provenance)


class LedgerItem(BaseModel):
    """A single scheduled future money movement (income or payment)."""

    id: str
    direction: Direction
    category: str                 # rent, groceries, electricity, phone, wages, shift, ...
    label: str
    amount_minor: int = Field(ge=0)
    date: dt.date
    status: ItemStatus = ItemStatus.expected
    essential: bool = False
    source: str = "user_entered"  # provenance
    shift_id: Optional[str] = None
    bill_id: Optional[str] = None
    updated_at: Optional[datetime] = None
    note: Optional[str] = None


class UserPreferences(BaseModel):
    tone: Literal["gentle", "direct", "encouraging"] = "gentle"
    language: str = "en"
    voice_briefings_opt_in: bool = False
    notifications_enabled: bool = True
    notification_channel: Literal["in_app"] = "in_app"
    scheduled_checkin: Literal["off", "daily", "every_minute_demo"] = "every_minute_demo"
    safety_buffer_minor: int = Field(default=5000, ge=0)
    family_assistance_available: bool = False
    family_currency: str = "AZN"
    family_language: str = "en"
    share_with_elevenlabs_consent: bool = False


class UserProfile(BaseModel):
    id: str
    name: str
    age: int
    location: str
    occupation: str
    currency: str = "GBP"
    reference_date: dt.date
    opening_balance_minor: int
    balance_as_of: datetime
    preferences: UserPreferences = UserPreferences()


class ForecastDay(BaseModel):
    date: dt.date
    opening_minor: int
    income_minor: int
    outgoing_minor: int
    closing_minor: int
    items: list[dict]


class Forecast(BaseModel):
    scenario: str
    reference_date: dt.date
    horizon_end: dt.date
    opening_minor: int
    days: list[ForecastDay]
    closing_minor: int
    min_balance_minor: int
    min_balance_date: dt.date
    first_negative_date: Optional[dt.date]
    critical_payment: Optional[dict]
    balance_at_critical_minor: Optional[int]
    uncovered_essentials: list[dict]
    total_income_minor: int
    total_outgoing_minor: int


class FinancialEventIn(BaseModel):
    """External event as posted by n8n or the local simulator."""

    event_id: str = Field(min_length=3, max_length=120)
    user_id: str
    event_type: Literal["shift_cancelled", "bill_updated", "income_delayed", "new_bill", "shift_added"]
    currency: Literal["GBP"] = "GBP"
    source: str = Field(min_length=2, max_length=80)
    event_date: Optional[dt.date] = None
    shift_id: Optional[str] = None
    bill_id: Optional[str] = None
    amount_minor: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    old_amount_minor: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    new_amount_minor: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    due_date: Optional[dt.date] = None
    new_date: Optional[dt.date] = None
    label: Optional[str] = None


class ScenarioIn(BaseModel):
    """A hypothetical change applied to a *copy* of the ledger."""

    type: Literal[
        "extra_expense", "extra_income", "remove_shift", "reduce_income",
        "bill_change", "delay_income", "change_payment_date",
    ]
    amount_minor: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    date: Optional[dt.date] = None
    item_id: Optional[str] = None
    days: Optional[int] = Field(default=None, ge=-60, le=60)
    label: Optional[str] = None
