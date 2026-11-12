"""Bridge AI — FastAPI backend."""
from __future__ import annotations

import hmac
import os
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
load_dotenv()

from fastapi import Depends, FastAPI, Header, HTTPException, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse, Response  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from .database import Store, db_path_from_env  # noqa: E402
from .integrations import n8n_client  # noqa: E402
from .models import FinancialEventIn, ScenarioIn  # noqa: E402
from .seed import amira  # noqa: E402
from .services import elevenlabs_service as eleven  # noqa: E402
from .services import penny_service as penny  # noqa: E402
from .services.event_processor import EventError, process_event  # noqa: E402
from .services.finance import simulate, snapshot, summary  # noqa: E402
from .services.forecasting import ScenarioError, fmt  # noqa: E402
from .services.recommendation_engine import build_plan, draft_message  # noqa: E402

app = FastAPI(title="Bridge AI API", version="1.0.0",
              description="Runway forecasting, event processing and Penny voice services. Demo build — fictional data only.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",")],
    allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type", "X-Bridge-Secret"],
)

STORE: Store | None = None
VOICE_STATE: dict = {"tts_last_ok": None, "tts_last_error": None, "agent_last_ok": None, "agent_last_error": None}


def get_store() -> Store:
    global STORE
    if STORE is None:
        STORE = Store(db_path_from_env())
        try:
            STORE.get_profile()
        except LookupError:
            seed(STORE)
    return STORE


def seed(store: Store) -> None:
    store.wipe()
    store.save_profile(amira.profile())
    for item in amira.ledger():
        store.save_item(item)


def require_secret(x_bridge_secret: Optional[str] = Header(default=None)) -> None:
    expected = n8n_client.shared_secret()
    if not x_bridge_secret or not hmac.compare_digest(x_bridge_secret, expected):
        raise HTTPException(401, "Missing or invalid X-Bridge-Secret")


@app.exception_handler(LookupError)
async def _lookup(_: Request, exc: LookupError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ------------------------------------------------------------------ health / user
@app.get("/api/health")
def health(store: Store = Depends(get_store)):
    store.get_profile()
    return {"status": "ok", "demo_mode": os.getenv("DEMO_MODE", "true").lower() == "true", "time": now()}


@app.get("/api/user")
def user(store: Store = Depends(get_store)):
    p = store.get_profile()
    return p.model_dump(mode="json") | {"fictional": True}


class PrefsPatch(BaseModel):
    tone: Optional[Literal["gentle", "direct", "encouraging"]] = None
    language: Optional[Literal["en"]] = None
    voice_briefings_opt_in: Optional[bool] = None
    notifications_enabled: Optional[bool] = None
    scheduled_checkin: Optional[Literal["off", "daily", "every_minute_demo"]] = None
    safety_buffer_minor: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    family_assistance_available: Optional[bool] = None
    family_currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    family_language: Optional[str] = None
    share_with_elevenlabs_consent: Optional[bool] = None


@app.patch("/api/user/preferences")
def patch_prefs(body: PrefsPatch, store: Store = Depends(get_store)):
    p = store.update_preferences(body.model_dump(exclude_none=True))
    return p.preferences


# ------------------------------------------------------------------ finance
@app.get("/api/finance/summary")
def finance_summary(store: Store = Depends(get_store)):
    return summary(store)


@app.get("/api/finance/forecast")
def finance_forecast(store: Store = Depends(get_store)):
    s = snapshot(store)
    return {"baseline": s["forecast"], "downside": s["downside"], "risk": s["risk"], "data_note": s["data_note"]}


@app.get("/api/finance/transactions")
def transactions(store: Store = Depends(get_store)):
    return {"items": [i.model_dump(mode="json") for i in store.ledger()]}


@app.post("/api/finance/simulate")
def finance_simulate(body: ScenarioIn, store: Store = Depends(get_store)):
    try:
        r = simulate(store, body)
    except ScenarioError as e:
        raise HTTPException(422, str(e))
    r["text_id"] = penny.register_speakable(r["explanation"])
    return r


# ------------------------------------------------------------------ alerts / plan
@app.get("/api/alerts")
def alerts(store: Store = Depends(get_store)):
    return {"alerts": store.alerts()}


class AlertPatch(BaseModel):
    read: bool


@app.patch("/api/alerts/{alert_id}")
def patch_alert(alert_id: int, body: AlertPatch, store: Store = Depends(get_store)):
    if not store.set_alert_read(alert_id, body.read):
        raise HTTPException(404, "Alert not found")
    return {"id": alert_id, "read": body.read}


@app.get("/api/rescue-plan")
def rescue_plan(store: Store = Depends(get_store)):
    return build_plan(store)


class ActionPatch(BaseModel):
    status: Literal["not_started", "in_progress", "completed"]


@app.patch("/api/rescue-plan/{action_id}")
def patch_action(action_id: str, body: ActionPatch, store: Store = Depends(get_store)):
    plan = build_plan(store)
    if action_id not in {a["id"] for a in plan["primary"] + plan["additional"]}:
        raise HTTPException(404, "Action not found")
    store.set_action_status(action_id, body.status)
    return {"id": action_id, "status": body.status}


class DraftIn(BaseModel):
    type: Literal["landlord", "employer_shift", "payroll", "adviser", "family"]


@app.post("/api/messages/draft")
def draft(body: DraftIn, store: Store = Depends(get_store)):
    return draft_message(store, body.type)


class FamilyEstimateIn(BaseModel):
    amount_minor: int = Field(gt=0, le=10_000_000)
    rate: str = Field(description="Illustrative GBP→currency rate as a decimal string, e.g. '2.15'")
    currency: str = Field(min_length=3, max_length=3)
    fee_minor: int = Field(default=0, ge=0, le=1_000_000)


@app.post("/api/family/estimate")
def family_estimate(body: FamilyEstimateIn):
    try:
        rate = Decimal(body.rate)
    except InvalidOperation:
        raise HTTPException(422, "rate must be a decimal number")
    if rate <= 0 or rate > 100000:
        raise HTTPException(422, "rate out of range")
    total_gbp_minor = body.amount_minor + body.fee_minor
    foreign = (Decimal(total_gbp_minor) / 100 * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {
        "amount_gbp": fmt(body.amount_minor), "fee_gbp": fmt(body.fee_minor), "total_gbp": fmt(total_gbp_minor),
        "sender_cost": f"{foreign} {body.currency.upper()}", "rate": str(rate),
        "rate_source": "Manual illustrative rate entered by the user — not a live quote",
        "calculated_at": now(),
        "caveat": "Indicative only. Real rates and fees vary by provider; nothing is sent automatically.",
    }


# ------------------------------------------------------------------ integrations / n8n
@app.post("/api/integrations/events", dependencies=[Depends(require_secret)])
def ingest_event(ev: FinancialEventIn, x_bridge_via: Optional[str] = Header(default=None),
                 store: Store = Depends(get_store)):
    via = "n8n" if (x_bridge_via or "").lower() == "n8n" else "api"
    if via == "n8n":
        n8n_client.note_inbound()
    try:
        result = process_event(store, ev, via, lambda: _risk_snap(store))
    except EventError as e:
        raise HTTPException(422, str(e))
    store.mark_delivered(ev.event_id)  # clears it from the integration inbox if it came from there
    if result["status"] == "processed":
        _maybe_alert(store, via)
    return result


@app.get("/api/integrations/pending", dependencies=[Depends(require_secret)])
def pending(store: Store = Depends(get_store)):
    evs = store.pending()
    return {"count": len(evs), "events": evs}


class AckIn(BaseModel):
    event_id: str


@app.post("/api/integrations/pending/ack", dependencies=[Depends(require_secret)])
def ack_pending(body: AckIn, store: Store = Depends(get_store)):
    store.mark_delivered(body.event_id)
    return {"acknowledged": body.event_id}


class CheckIn(BaseModel):
    via: Literal["n8n", "local"] = "n8n"


@app.post("/api/monitoring/check", dependencies=[Depends(require_secret)])
def monitoring_check(body: CheckIn, store: Store = Depends(get_store)):
    if body.via == "n8n":
        n8n_client.note_inbound()
    return _run_check(store, body.via)


def _run_check(store: Store, via: str) -> dict:
    prefs = store.get_profile().preferences
    s = summary(store)
    created = None
    if prefs.scheduled_checkin == "off":
        result = {"status": s["risk"]["status"], "alert_created": False, "skipped": "scheduled check-ins are off"}
    else:
        created = _maybe_alert(store, via)
        result = {"status": s["risk"]["status"], "balance_at_critical": fmt(s["balance_at_critical_minor"] or 0),
                  "alert_created": created is not None,
                  "notifications": "on" if prefs.notifications_enabled else "off (alert stored silently)"}
    store.log_run(via, result)
    return result


def _risk_snap(store: Store) -> dict:
    s = summary(store)
    return {"balance_at_critical_minor": s["balance_at_critical_minor"], "risk": s["risk"]["status"]}


def _maybe_alert(store: Store, via: str) -> Optional[int]:
    """One alert per distinct (risk, projected balance) state — never duplicates."""
    s = summary(store)
    status, at = s["risk"]["status"], s["balance_at_critical_minor"]
    if status == "green":
        return None
    crit = s["critical_payment"]
    title = ("Possible shortfall before " + crit["label"].lower()) if status == "red" else "Your buffer is very small"
    body = " ".join(s["risk"]["reasons"])
    return store.add_alert(f"{status}:{at}", status, title, body, via)


@app.get("/api/integrations/status")
def integrations_status(store: Store = Depends(get_store)):
    st = n8n_client.STATE
    if not n8n_client.webhook_url():
        n8n_events = ("not_connected", "N8N_WEBHOOK_URL is not set. Demo buttons use the labelled local simulation.")
    elif st["last_ok"] and (not st["last_error"] or st["last_ok"] > st["last_error"]):
        n8n_events = ("connected", f"Last event delivered through n8n at {st['last_ok']}.")
    elif st["last_error"]:
        n8n_events = ("unavailable", f"Automation unavailable: {st['last_error']}")
    else:
        n8n_events = ("configured_untested", "Webhook URL is set but no event has been sent yet.")
    n8n_runs = [r for r in store.runs(50) if r["via"] == "n8n"]
    if n8n_runs:
        last = n8n_runs[0]["ran_at"]
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds()
        n8n_sched = ("connected", f"Last scheduled check from n8n at {last}.") if age < 600 else \
            ("unavailable", f"No scheduled check from n8n since {last}. Data may be stale.")
    else:
        n8n_sched = ("not_connected", "No scheduled monitoring run has been received from n8n yet.")

    def voice(configured: bool, ok_key: str, err_key: str, what: str):
        if not configured:
            return ("not_connected", f"{what} is not configured on the server.")
        if VOICE_STATE[err_key] and (not VOICE_STATE[ok_key] or VOICE_STATE[err_key] > VOICE_STATE[ok_key]):
            return ("unavailable", f"Last attempt failed: {VOICE_STATE[err_key]}")
        if VOICE_STATE[ok_key]:
            return ("connected", f"Last successful call at {VOICE_STATE[ok_key]}.")
        return ("configured_untested", f"{what} credentials are set; not used yet this session.")

    rows = [
        ("n8n_events", "n8n — financial events workflow", *n8n_events),
        ("n8n_schedule", "n8n — scheduled monitoring", *n8n_sched),
        ("elevenlabs_tts", "ElevenLabs — Penny briefings (TTS)",
         *voice(eleven.tts_configured(), "tts_last_ok", "tts_last_error", "Text-to-speech")),
        ("elevenlabs_agent", "ElevenLabs — Penny live conversation",
         *voice(eleven.agent_configured(), "agent_last_ok", "agent_last_error", "Conversational agent")),
        ("work_calendar", "Work calendar (shifts)", "demo_simulation",
         "Fictional rota events generated by the demo panel. No real employer system is connected."),
        ("energy_notices", "Energy bill notices", "demo_simulation", "Fictional bill notices from the demo panel."),
        ("bank_account", "Bank balance", "demo_simulation",
         f"Fictional balance as of {store.get_profile().balance_as_of.day} {store.get_profile().balance_as_of:%b %Y %H:%M} UTC. No bank is connected."),
    ]
    return {"integrations": [{"id": r[0], "name": r[1], "status": r[2], "detail": r[3]} for r in rows],
            "runs": store.runs(10)}


# ------------------------------------------------------------------ Penny
class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)


@app.post("/api/penny/chat")
def penny_chat(body: ChatIn, store: Store = Depends(get_store)):
    return penny.chat(store, body.message)


@app.post("/api/penny/briefing")
def penny_briefing(store: Store = Depends(get_store)):
    return penny.briefing(store)


class SpeechIn(BaseModel):
    text_id: str = Field(min_length=8, max_length=64)


@app.post("/api/penny/speech")
async def penny_speech(body: SpeechIn, store: Store = Depends(get_store)):
    text = penny.speakable(body.text_id)
    if text is None:
        raise HTTPException(404, "Unknown text_id — only text generated by Bridge can be spoken.")
    if not store.get_profile().preferences.share_with_elevenlabs_consent:
        raise HTTPException(403, "Voice needs your consent to send this text to ElevenLabs (Settings → Voice).")
    try:
        audio = await eleven.synthesize(text)
    except eleven.VoiceUnavailable as e:
        VOICE_STATE["tts_last_error"] = f"{now()} — {e}"
        raise HTTPException(503, f"Audio is temporarily unavailable: {e}")
    VOICE_STATE["tts_last_ok"] = now()
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@app.get("/api/penny/conversation-credentials")
async def conversation_credentials(store: Store = Depends(get_store)):
    if not store.get_profile().preferences.share_with_elevenlabs_consent:
        raise HTTPException(403, "Live conversation needs your consent to use ElevenLabs (Settings → Voice).")
    try:
        creds = await eleven.conversation_credentials()
    except eleven.VoiceUnavailable as e:
        VOICE_STATE["agent_last_error"] = f"{now()} — {e}"
        raise HTTPException(503, str(e))
    VOICE_STATE["agent_last_ok"] = now()
    return creds


class ToolIn(BaseModel):
    parameters: dict = {}


@app.post("/api/penny/tools/{name}")
def penny_tool(name: str, body: ToolIn, store: Store = Depends(get_store)):
    fn = penny.TOOLS.get(name)
    if fn is None:
        raise HTTPException(404, "Unknown tool")
    return fn(store, body.parameters)


@app.get("/api/penny/status")
def penny_status():
    return {"tts_configured": eleven.tts_configured(), "agent_configured": eleven.agent_configured()}


# ------------------------------------------------------------------ demo controls
SHIFT_EVENT = {
    "event_id": "evt_demo_shift_cancel_2026_11_21", "user_id": amira.USER_ID, "event_type": "shift_cancelled",
    "shift_id": "shift_2026_11_21", "event_date": "2026-11-07", "amount_minor": 9000, "currency": "GBP",
    "source": "demo_work_calendar",
}
BILL_EVENT = {
    "event_id": "evt_demo_electricity_notice_nov", "user_id": amira.USER_ID, "event_type": "bill_updated",
    "bill_id": "bill_electricity_nov", "old_amount_minor": 3500, "new_amount_minor": 6000,
    "due_date": "2026-11-22", "currency": "GBP", "source": "demo_energy_notice",
}


async def _demo_event(payload: dict, store: Store) -> dict:
    if n8n_client.webhook_url():
        try:
            body = await n8n_client.send_event(payload)
            result = body.get("bridge_result", body) if isinstance(body, dict) else body
            return {"path": "n8n", "label": "Processed by the n8n workflow", "result": result}
        except RuntimeError as e:
            fallback_reason = str(e)
    else:
        fallback_reason = "n8n is not configured (N8N_WEBHOOK_URL unset)."
    ev = FinancialEventIn.model_validate(payload)
    try:
        result = process_event(store, ev, "local_simulation", lambda: _risk_snap(store))
    except EventError as e:
        raise HTTPException(422, str(e))
    if result["status"] == "processed":
        _maybe_alert(store, "local_simulation")
    return {"path": "local_simulation",
            "label": "Local simulation — n8n did NOT run this event", "reason": fallback_reason, "result": result}


@app.post("/api/demo/reset")
def demo_reset(store: Store = Depends(get_store)):
    seed(store)
    return {"status": "reset", "summary": summary(store)}


@app.post("/api/demo/simulate-shift-cancellation")
async def demo_shift(store: Store = Depends(get_store)):
    return await _demo_event(dict(SHIFT_EVENT), store)


@app.post("/api/demo/simulate-bill-increase")
async def demo_bill(store: Store = Depends(get_store)):
    return await _demo_event(dict(BILL_EVENT), store)


class QueueIn(BaseModel):
    kind: Literal["shift", "bill"]


@app.post("/api/demo/queue-event")
def demo_queue(body: QueueIn, store: Store = Depends(get_store)):
    """Puts an event in the integration inbox, as a calendar/bill adapter would.
    The n8n scheduled workflow picks it up — no button press needed after this."""
    payload = dict(SHIFT_EVENT if body.kind == "shift" else BILL_EVENT)
    payload["source"] += "_inbox"
    added = store.queue_pending(payload["event_id"], payload)
    return {"queued": added, "event_id": payload["event_id"],
            "message": "Queued for the n8n scheduled workflow." if added else "Already queued."}


@app.post("/api/demo/run-monitoring-check")
def demo_check(store: Store = Depends(get_store)):
    return _run_check(store, "local")


@app.get("/api/demo/events")
def demo_events(store: Store = Depends(get_store)):
    return {"events": store.events(), "pending": store.pending(), "runs": store.runs(10)}
