"""Deterministic rescue-plan rules.

Never: invents savings, suggests skipping food/heating/housing, treats moving money
between pots as a fix, or recommends high-cost credit.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from ..database import Store
from ..models import Direction, ItemStatus, ScenarioIn
from .finance import simulate, snapshot
from .forecasting import fmt

RESOURCES = json.loads((Path(__file__).parent.parent / "seed" / "support_resources.json").read_text())


def _d(iso: str) -> str:
    return f"{date.fromisoformat(iso).day} {date.fromisoformat(iso):%B}"


def build_plan(store: Store) -> dict:
    s = snapshot(store)
    items = store.ledger()
    statuses = store.action_statuses()
    events = store.events(limit=100)
    crit = s["critical_payment"]
    at_crit = s["balance_at_critical_minor"]
    status = s["risk"]["status"]
    actions: list[dict] = []

    # 1) Income: a shift was cancelled
    cancelled = [i for i in items if i.status == ItemStatus.cancelled and i.direction == Direction.income]
    if cancelled:
        lost = sum(i.amount_minor for i in cancelled)
        sim = simulate(store, ScenarioIn(type="extra_income", amount_minor=lost))
        ev = next((e for e in events if e["event_type"] == "shift_cancelled"), None)
        actions.append({
            "id": "review_shifts", "category": "income", "priority": "high",
            "title": "Review your work schedule",
            "description": f"A cancelled shift reduced your expected pay by {fmt(lost)}. "
                           "It may be worth asking whether another shift is available.",
            "why": "Lost hours are the main reason your forecast changed.",
            "triggering_event": ev["event_id"] if ev else None,
            "relevant_date": sim["scenario"]["date"] or (s["next_payday"] or {}).get("date"),
            "impact": {"known": True, "conditional": True,
                       "text": f"If a replacement {fmt(lost)} shift is available and paid before "
                               f"{crit['label'].lower() if crit else 'your next big bill'}, your forecast would "
                               f"move from {fmt(at_crit)} to {fmt(sim['updated_balance_at_critical_minor'])}."},
            "limitations": "Replacement work may not be available. Bridge cannot see your employer's rota.",
            "next_step": "Ask your manager about extra shifts. A draft message is ready to edit.",
            "draft_type": "employer_shift", "resources": [],
        })

    # 2) Housing / essentials at risk
    if crit and at_crit is not None and at_crit < 0:
        actions.append({
            "id": "contact_landlord", "category": "housing", "priority": "urgent",
            "title": "Protect your rent payment",
            "description": f"Your forecast shows you may be {fmt(-at_crit)} short when {crit['label'].lower()} "
                           f"({fmt(crit['amount_minor'])}) is due on {_d(crit['date'])}. Contacting your "
                           "landlord early can open up options such as a short payment arrangement.",
            "why": "Housing is an essential payment. Talking early usually gives more options than talking late.",
            "triggering_event": None, "relevant_date": crit["date"],
            "impact": {"known": False, "text": "Impact not yet known — depends on your landlord's response."},
            "limitations": "A landlord does not have to agree to an arrangement. Bridge never sends anything for you.",
            "next_step": "Review and edit the draft message, then send it yourself if you choose to.",
            "draft_type": "landlord", "resources": [],
        })

    # 3) Bill changed
    bill_ev = next((e for e in events if e["event_type"] == "bill_updated"), None)
    if bill_ev and status != "green":
        actions.append({
            "id": "check_bill", "category": "bills", "priority": "medium",
            "title": "Check the higher electricity bill",
            "description": bill_ev["result"]["summary"] + " Suppliers can often offer a payment plan "
                           "if you contact them before the due date.",
            "why": "The higher bill is the second reason your forecast changed.",
            "triggering_event": bill_ev["event_id"], "relevant_date": bill_ev["payload"].get("due_date"),
            "impact": {"known": False, "text": "Impact not yet known — depends on what your supplier offers."},
            "limitations": "Bridge cannot check whether the bill is correct; compare it with your meter reading.",
            "next_step": "Check the notice against a meter reading and contact your supplier if it looks wrong.",
            "draft_type": None, "resources": [],
        })

    # 4) Free support
    if status in ("red", "amber"):
        actions.append({
            "id": "explore_support", "category": "support", "priority": "high" if status == "red" else "medium",
            "title": "Explore free support and advice",
            "description": "Free, confidential advisers can help you look at options for bills and rent. "
                           "Your university's student money adviser is often a good first stop.",
            "why": "Advisers know about options Bridge cannot see, and their help is free.",
            "triggering_event": None, "relevant_date": None,
            "impact": {"known": False, "text": "Impact not yet known."},
            "limitations": "Eligibility for any fund or scheme depends on your circumstances. "
                           "As an international student, check your visa conditions before applying for "
                           "any public support — some is not available to people with 'no recourse to public funds'.",
            "next_step": "Contact your university's student support team. A draft message is ready.",
            "draft_type": "adviser", "resources": RESOURCES["resources"],
        })

    if not actions:
        actions.append({
            "id": "keep_watch", "category": "planning", "priority": "low",
            "title": "You're on track — Bridge will keep watching",
            "description": "No shortfall is forecast. Bridge will tell you if a shift or bill changes.",
            "why": "Early warnings work best when monitoring is on.",
            "triggering_event": None, "relevant_date": None,
            "impact": {"known": False, "text": "No action needed right now."},
            "limitations": "Forecasts only include what Bridge knows about.",
            "next_step": "Nothing to do. Check in any time.", "draft_type": None, "resources": [],
        })

    order = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
    actions.sort(key=lambda a: order[a["priority"]])
    for a in actions:
        a["status"] = statuses.get(a["id"], "not_started")
    return {
        "risk": s["risk"],
        "primary": actions[:3],
        "additional": actions[3:],
        "caveat": "Bridge provides general information, not regulated financial, legal or immigration advice. "
                  "Support eligibility varies with individual circumstances.",
    }


def draft_message(store: Store, kind: str, extra: dict | None = None) -> dict:
    s = snapshot(store)
    name = s["user"]["name"]
    crit = s["critical_payment"]
    at = s["balance_at_critical_minor"] or 0
    short = fmt(-at) if at < 0 else None
    cancelled = sum(i.amount_minor for i in store.ledger()
                    if i.status == ItemStatus.cancelled and i.direction == Direction.income)
    if kind == "landlord":
        subject = "Rent due " + (_d(crit["date"]) if crit else "")
        body = (f"Dear landlord,\n\nI'm writing early about my rent due on {_d(crit['date']) if crit else '[date]'}. "
                "Some of my work shifts were cancelled and a bill came in higher than expected, so "
                f"{'I may be around ' + short + ' short' if short else 'my budget is very tight'} this month.\n\n"
                "I want to pay in full and wanted to ask whether a short payment arrangement would be possible, "
                f"for example paying the remaining amount by [date].\n\nThank you for considering this.\n\nKind regards,\n{name}")
    elif kind == "employer_shift":
        subject = "Extra shifts"
        body = (f"Hi [manager's name],\n\nI understand my shift was cancelled. If any extra shifts come up before "
                f"the end of the month, I'd be glad to take them — I'm available on [days/times].\n\nThanks,\n{name}")
    elif kind == "payroll":
        subject = "Question about my pay"
        body = (f"Hello,\n\nCould you help me check my pay for this period? I expected {fmt(s['expected_income_minor'])} "
                f"on {_d(s['next_payday']['date']) if s['next_payday'] else '[date]'}. Could you confirm the amount and "
                f"payment date?\n\nThank you,\n{name}")
    elif kind == "adviser":
        subject = "Request for money advice appointment"
        body = (f"Hello,\n\nI'm an international student working part-time. My forecast shows I may be "
                f"{short or 'very tight'} when my rent is due on {_d(crit['date']) if crit else '[date]'}, "
                f"mainly because {('a shift worth ' + fmt(cancelled) + ' was cancelled') if cancelled else 'my income changed'}. "
                "Could I book an appointment to talk through my options?\n\nThank you,\n" + name)
    elif kind == "family":
        subject = "Update"
        body = ("I'm managing an unexpected shortfall after some work shifts were cancelled. "
                "I'm reviewing my options and wanted to let you know about the situation.")
    else:
        raise ValueError("Unknown draft type")
    return {"type": kind, "subject": subject, "body": body,
            "note": "Draft only. Edit it, and send it yourself if you choose. Bridge never sends messages for you."}
