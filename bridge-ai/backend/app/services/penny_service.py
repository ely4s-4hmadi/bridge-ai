"""Penny's deterministic brain: briefings, typed-chat answers and agent tools.

Every number Penny says comes from Runway (finance.snapshot / finance.simulate).
No LLM is needed. Text for speech is registered here so the TTS endpoint only
voices text Bridge generated itself (never arbitrary user-supplied text).
"""
from __future__ import annotations

import hashlib
import re
from collections import OrderedDict
from datetime import date, timedelta

from ..database import Store
from ..models import ScenarioIn
from .finance import simulate, snapshot, summary
from .forecasting import ScenarioError, fmt
from .recommendation_engine import build_plan

_SPEAKABLE: "OrderedDict[str, str]" = OrderedDict()


def register_speakable(text: str) -> str:
    tid = hashlib.sha256(text.encode()).hexdigest()[:16]
    _SPEAKABLE[tid] = text
    while len(_SPEAKABLE) > 200:
        _SPEAKABLE.popitem(last=False)
    return tid


def speakable(text_id: str) -> str | None:
    return _SPEAKABLE.get(text_id)


def _d(iso: str) -> str:
    return f"{date.fromisoformat(iso).day} {date.fromisoformat(iso):%B}"


OPENERS = {
    "gentle": "Hi {name}.",
    "direct": "{name}, here's where things stand.",
    "encouraging": "Hi {name} — you're doing the right thing by checking in.",
}


def briefing(store: Store) -> dict:
    s = snapshot(store)
    tone = store.get_profile().preferences.tone
    name = s["user"]["name"]
    events = [e for e in store.events(limit=10) if e["status"] == "processed"]
    crit = s["critical_payment"]
    at = s["balance_at_critical_minor"]
    parts = [OPENERS[tone].format(name=name)]
    if events:
        n = len(events)
        words = {1: "one change", 2: "two changes", 3: "three changes", 4: "four changes"}
        parts.append(f"I've noticed {words.get(n, str(n) + ' changes')} that could affect your finances.")
        labels = {i.bill_id: i.label.lower() for i in store.ledger() if i.bill_id}
        for e in reversed(events):
            p, r = e["payload"], e["result"]
            if e["event_type"] == "shift_cancelled":
                parts.append(f"One of your work shifts has been cancelled, reducing your expected earnings by "
                             f"{fmt(p.get('amount_minor') or -r['change_minor'])}.")
            elif e["event_type"] == "bill_updated" and p.get("new_amount_minor") is not None and p.get("old_amount_minor") is not None:
                diff = p["new_amount_minor"] - p["old_amount_minor"]
                also = " also" if len(parts) > 2 else ""
                parts.append(f"Your {labels.get(p.get('bill_id'), 'bill')} is{also} {fmt(abs(diff))} "
                             f"{'higher' if diff > 0 else 'lower'} than expected.")
            else:
                parts.append(r["summary"])
    if crit and at is not None:
        if at < 0:
            parts.append(f"Based on the payments you've entered, you could be {fmt(-at)} short when your "
                         f"{crit['label'].lower()} is due on {_d(crit['date'])}.")
            parts.append("This is a forecast, not a certainty. We can look at some options together. "
                         "Would you like me to explain?")
        else:
            parts.append(f"Based on the payments you've entered, you should have about {fmt(at)} left after your "
                         f"{crit['label'].lower()} on {_d(crit['date'])}.")
            if s["risk"]["status"] == "amber":
                parts.append("That's a very small buffer, so I'll keep an eye on any changes for you.")
    text = " ".join(parts)
    return {"text": text, "text_id": register_speakable(text), "risk": s["risk"]["status"],
            "facts": {"balance_at_critical_minor": at, "critical_payment": crit}}


# ---------------------------------------------------------------- tools ----
def tool_get_financial_summary(store: Store, _: dict | None = None) -> dict:
    s = summary(store)
    crit = s["critical_payment"]
    return {
        "current_balance": fmt(s["current_balance_minor"]),
        "balance_as_of": s["balance_as_of"],
        "confirmed_income": fmt(s["confirmed_income_minor"]),
        "expected_unconfirmed_income": fmt(s["expected_unconfirmed_income_minor"]),
        "essential_payments": fmt(s["essential_payments_minor"]),
        "critical_payment": f"{crit['label']} {fmt(crit['amount_minor'])} on {_d(crit['date'])}" if crit else None,
        "projected_balance_after_critical_payment": fmt(s["balance_at_critical_minor"]) if crit else None,
        "downside_if_unconfirmed_income_missing": fmt(s["downside_balance_at_critical_minor"]) if crit else None,
        "status": s["risk"]["label"], "status_reasons": s["risk"]["reasons"],
        "note": "Forecast only, based on entered payments. Not guaranteed.",
    }


def tool_get_upcoming_payments(store: Store, _: dict | None = None) -> dict:
    p = store.get_profile()
    rows = [{"date": i.date.isoformat(), "label": i.label, "amount": fmt(i.amount_minor),
             "type": i.direction.value, "status": i.status.value, "essential": i.essential}
            for i in store.ledger() if i.date >= p.reference_date and i.status.value != "cancelled"]
    return {"items": rows}


def tool_get_recent_financial_events(store: Store, _: dict | None = None) -> dict:
    return {"events": [{"event_id": e["event_id"], "type": e["event_type"], "summary": e["result"].get("summary"),
                        "source": e["source"], "via": e["via"], "received_at": e["received_at"]}
                       for e in store.events(limit=10)]}


def tool_get_rescue_plan(store: Store, _: dict | None = None) -> dict:
    plan = build_plan(store)
    return {"actions": [{"title": a["title"], "description": a["description"], "impact": a["impact"]["text"],
                         "limitations": a["limitations"], "status": a["status"]} for a in plan["primary"]],
            "caveat": plan["caveat"]}


def tool_run_what_if_scenario(store: Store, params: dict | None = None) -> dict:
    params = dict(params or {})
    if "amount_pounds" in params and "amount_minor" not in params:
        params["amount_minor"] = _pounds_to_minor(str(params.pop("amount_pounds")))
    params = {k: v for k, v in params.items() if k in ScenarioIn.model_fields and v not in (None, "")}
    try:
        sc = ScenarioIn.model_validate(params)
        r = simulate(store, sc)
    except (ScenarioError, ValueError) as e:
        return {"error": str(e)}
    return {"explanation": r["explanation"],
            "original_balance_at_critical": fmt(r["original_balance_at_critical_minor"]),
            "new_balance_at_critical": fmt(r["updated_balance_at_critical_minor"]),
            "timing_warning": r["timing_warning"]}


TOOLS = {
    "get_financial_summary": tool_get_financial_summary,
    "get_upcoming_payments": tool_get_upcoming_payments,
    "run_what_if_scenario": tool_run_what_if_scenario,
    "get_recent_financial_events": tool_get_recent_financial_events,
    "get_rescue_plan": tool_get_rescue_plan,
}


# ----------------------------------------------------------------- chat ----
_AMOUNT = re.compile(r"£\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s?(?:pounds|quid|gbp)", re.I)


def _pounds_to_minor(s: str) -> int:
    whole, _, frac = s.strip().lstrip("£").partition(".")
    return int(whole) * 100 + int((frac + "00")[:2] if frac else 0)


def _amount(text: str) -> int | None:
    m = _AMOUNT.search(text)
    if not m:
        return None
    return _pounds_to_minor(m.group(1) or m.group(2))


def _weekend(ref: date) -> date:
    # The nearest Saturday or Sunday on/after the reference date (Sunday if today is Saturday).
    if ref.weekday() == 5:
        return ref + timedelta(days=1)
    if ref.weekday() == 6:
        return ref
    return ref + timedelta(days=5 - ref.weekday())


def chat(store: Store, message: str) -> dict:
    t = message.lower().strip()
    p = store.get_profile()
    amt = _amount(t)
    scenario: ScenarioIn | None = None
    intent = "fallback"

    if re.search(r"\b(afford|spend|buy|spending)\b", t):
        intent = "what_if_spend"
        when = _weekend(p.reference_date) if "weekend" in t else p.reference_date
        scenario = ScenarioIn(type="extra_expense", amount_minor=amt or 3000, date=when,
                              label="Weekend spending" if "weekend" in t else "Spending")
    elif re.search(r"\b(late|delay|delayed)\b", t):
        intent = "what_if_delay"
        m = re.search(r"(\d+)\s*days?", t)
        scenario = ScenarioIn(type="delay_income", days=int(m.group(1)) if m else 3)
    elif re.search(r"(lose|lost|cancel).*(shift)", t):
        intent = "what_if_lose_shift"
        scenario = ScenarioIn(type="remove_shift", amount_minor=amt or 9000)
    elif re.search(r"\b(extra|another|additional|more)\b.*\b(shift|work|earn|income)|\b(earns?|receives?|gets?|works?)\b.*£", t):
        intent = "what_if_income"
        after_rent = "after rent" in t
        rent = next((i for i in store.ledger() if i.category == "rent"), None)
        when = (rent.date + timedelta(days=2)) if (after_rent and rent) else None
        scenario = ScenarioIn(type="extra_income", amount_minor=amt or 9000, date=when)
    elif re.search(r"(electric|bill).*(up|increase|rise|more)", t):
        intent = "what_if_bill"
        bill = next((i for i in store.ledger() if i.category == "electricity" and i.status.value != "cancelled"), None)
        if bill:
            scenario = ScenarioIn(type="bill_change", item_id=bill.id, amount_minor=amt or 2000)

    if scenario is not None:
        try:
            r = simulate(store, scenario)
            reply = r["explanation"]
            data = {"scenario": r["scenario"], "original": r["original_balance_at_critical_minor"],
                    "updated": r["updated_balance_at_critical_minor"]}
        except ScenarioError as e:
            reply, data = f"I couldn't run that scenario: {e}", None
        return _reply(intent, reply, data)

    s = snapshot(store)
    crit, at = s["critical_payment"], s["balance_at_critical_minor"]
    if re.search(r"\b(why|red|amber|green|status|colou?r)\b", t) and "changed" not in t:
        reply = (f"Your forecast is {s['risk']['status']}: {s['risk']['label'].lower()}. " + " ".join(s["risk"]["reasons"]) +
                 " The colour is a forecast, not a judgement or a credit score.")
        return _reply("explain_status", reply)
    if re.search(r"rent|what should i do|plan|options|help", t) and "simpl" not in t:
        plan = build_plan(store)
        steps = "; ".join(f"{n + 1}. {a['title']}" for n, a in enumerate(plan["primary"]))
        return _reply("rescue_plan", f"Here are the steps I'd suggest looking at: {steps}. "
                                     "You decide which ones to take. Open the Plan tab for drafts and details.")
    if "simpl" in t:
        if at is not None and at < 0:
            reply = (f"Simply put: money coming in is a bit less than money going out before rent. "
                     f"You might be {fmt(-at)} short on {_d(crit['date'])}. Talking to your landlord early, "
                     "asking about shifts, and getting free advice can all help.")
        else:
            reply = f"Simply put: you should just about cover your payments, with {fmt(at or 0)} left over."
        return _reply("simple", reply)
    if re.search(r"how much|balance|december|left|money will i have|summary", t) and crit:
        reply = (f"On {_d(crit['date'])}, after your {crit['label'].lower()}, your projected balance is "
                 f"{fmt(at)}. Right now your balance is {fmt(s['current_balance_minor'])}. "
                 "This is a forecast based on the payments you've entered.")
        return _reply("summary", reply)
    if re.search(r"event|changed|what happened|why.*change", t):
        evs = store.events(limit=5)
        reply = ("Recent changes: " + " ".join(e["result"].get("summary", "") for e in evs)) if evs \
            else "No changes have been detected yet."
        return _reply("events", reply)
    return _reply("fallback", "I can tell you your balance on rent day, explain your forecast colour, "
                              "run a 'what if' (for example, 'Can I afford to spend £30 this weekend?'), "
                              "or go through your plan.")


def _reply(intent: str, text: str, data: dict | None = None) -> dict:
    return {"intent": intent, "reply": text, "text_id": register_speakable(text), "data": data,
            "engine": "deterministic (Runway-grounded)"}
