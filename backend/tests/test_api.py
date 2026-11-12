"""Backend integration tests (FastAPI TestClient, temporary SQLite DB, no network)."""
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test-secret"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("N8N_SHARED_SECRET", SECRET)
    monkeypatch.delenv("N8N_WEBHOOK_URL", raising=False)
    for k in ("ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "ELEVENLABS_VOICE_ID"):
        monkeypatch.delenv(k, raising=False)
    import app.main as main
    main.STORE = None
    with TestClient(main.app) as c:
        c.post("/api/demo/reset")
        yield c
    main.STORE = None


H = {"X-Bridge-Secret": SECRET, "X-Bridge-Via": "n8n"}
SHIFT = {"event_id": "evt_t1", "user_id": "user_amira", "event_type": "shift_cancelled",
         "shift_id": "shift_2026_11_21", "amount_minor": 9000, "currency": "GBP", "source": "test_calendar"}
BILL = {"event_id": "evt_t2", "user_id": "user_amira", "event_type": "bill_updated",
        "bill_id": "bill_electricity_nov", "old_amount_minor": 3500, "new_amount_minor": 6000,
        "due_date": "2026-11-22", "currency": "GBP", "source": "test_energy"}


def at_crit(c):
    return c.get("/api/finance/summary").json()["balance_at_critical_minor"]


def test_health_and_initial_forecast(client):
    assert client.get("/api/health").json()["status"] == "ok"
    s = client.get("/api/finance/summary").json()
    assert s["balance_at_critical_minor"] == 3000
    assert s["risk"]["status"] == "amber"
    f = client.get("/api/finance/forecast").json()
    assert f["baseline"]["days"][0]["date"] == "2026-11-07"


def test_event_ingestion_requires_secret(client):
    assert client.post("/api/integrations/events", json=SHIFT).status_code == 401
    assert client.post("/api/integrations/events", json=SHIFT, headers={"X-Bridge-Secret": "wrong"}).status_code == 401


def test_events_update_forecast_and_dedupe(client):
    r = client.post("/api/integrations/events", json=SHIFT, headers=H).json()
    assert r["status"] == "processed" and r["via"] == "n8n" and r["change_minor"] == -9000
    assert at_crit(client) == -6000
    assert client.post("/api/integrations/events", json=SHIFT, headers=H).json()["status"] == "duplicate"
    assert at_crit(client) == -6000
    client.post("/api/integrations/events", json=BILL, headers=H)
    s = client.get("/api/finance/summary").json()
    assert s["balance_at_critical_minor"] == -8500 and s["risk"]["status"] == "red"
    alerts = client.get("/api/alerts").json()["alerts"]
    assert len({a["signature"] for a in alerts}) == len(alerts)  # no duplicate alerts


def test_malformed_events_rejected(client):
    bad = dict(SHIFT, event_type="lottery_win")
    assert client.post("/api/integrations/events", json=bad, headers=H).status_code == 422
    missing = {k: v for k, v in SHIFT.items() if k != "event_id"}
    assert client.post("/api/integrations/events", json=missing, headers=H).status_code == 422
    wrong_old = dict(BILL, old_amount_minor=1)
    assert client.post("/api/integrations/events", json=wrong_old, headers=H).status_code == 422
    neg = dict(SHIFT, event_id="evt_neg", amount_minor=-5)
    assert client.post("/api/integrations/events", json=neg, headers=H).status_code == 422
    assert at_crit(client) == 3000


def test_simulate_endpoint(client):
    client.post("/api/demo/simulate-shift-cancellation")
    client.post("/api/demo/simulate-bill-increase")
    r = client.post("/api/finance/simulate", json={"type": "extra_expense", "amount_minor": 3000, "date": "2026-11-08"}).json()
    assert (r["original_balance_at_critical_minor"], r["updated_balance_at_critical_minor"]) == (-8500, -11500)
    r = client.post("/api/finance/simulate", json={"type": "extra_income", "amount_minor": 10000}).json()
    assert r["updated_balance_at_critical_minor"] == 1500 and r["timing_warning"] is None
    r = client.post("/api/finance/simulate", json={"type": "extra_income", "amount_minor": 10000, "date": "2026-12-03"}).json()
    assert r["updated_balance_at_critical_minor"] == -8500 and r["timing_warning"]
    assert at_crit(client) == -8500  # base case unchanged
    assert client.post("/api/finance/simulate", json={"type": "extra_expense"}).status_code == 422


def test_demo_local_fallback_is_labelled(client):
    r = client.post("/api/demo/simulate-shift-cancellation").json()
    assert r["path"] == "local_simulation" and "NOT" in r["label"]
    ev = client.get("/api/demo/events").json()["events"][0]
    assert ev["via"] == "local_simulation"


def test_rescue_plan_and_drafts(client):
    plan = client.get("/api/rescue-plan").json()
    assert plan["risk"]["status"] == "amber"
    client.post("/api/demo/simulate-shift-cancellation")
    client.post("/api/demo/simulate-bill-increase")
    plan = client.get("/api/rescue-plan").json()
    ids = [a["id"] for a in plan["primary"]]
    assert ids[0] == "contact_landlord" and "review_shifts" in ids and "explore_support" in ids
    shift = next(a for a in plan["primary"] if a["id"] == "review_shifts")
    assert "−£85" in shift["impact"]["text"] and "£5" in shift["impact"]["text"]
    landlord = next(a for a in plan["primary"] if a["id"] == "contact_landlord")
    assert landlord["impact"]["text"].startswith("Impact not yet known")
    assert client.patch("/api/rescue-plan/contact_landlord", json={"status": "in_progress"}).status_code == 200
    assert client.get("/api/rescue-plan").json()["primary"][0]["status"] == "in_progress"
    d = client.post("/api/messages/draft", json={"type": "landlord"}).json()
    assert "£85" in d["body"] and "never sends" in d["note"]


def test_penny_chat_grounded(client):
    client.post("/api/demo/simulate-shift-cancellation")
    client.post("/api/demo/simulate-bill-increase")
    r = client.post("/api/penny/chat", json={"message": "Can I afford to spend £30 this weekend?"}).json()
    assert r["data"]["updated"] == -11500 and "−£115" in r["reply"]
    r = client.post("/api/penny/chat", json={"message": "Penny, what if Amira earns another £100 before rent?"}).json()
    assert r["data"]["updated"] == 1500 and "£15" in r["reply"]
    r = client.post("/api/penny/chat", json={"message": "How much money will I have on 1 December?"}).json()
    assert "−£85" in r["reply"]
    r = client.post("/api/penny/chat", json={"message": "Why is my forecast red?"}).json()
    assert r["intent"] == "explain_status"
    b = client.post("/api/penny/briefing").json()
    assert "£90" in b["text"] and "£25" in b["text"] and "£85 short" in b["text"] and "1 December" in b["text"]


def test_tools_match_forecast(client):
    t = client.post("/api/penny/tools/run_what_if_scenario",
                    json={"parameters": {"type": "extra_income", "amount_pounds": "100"}}).json()
    assert t["new_balance_at_critical"] == "£130"
    assert client.post("/api/penny/tools/unknown", json={}).status_code == 404


def test_voice_unavailable_is_honest(client):
    b = client.post("/api/penny/briefing").json()
    assert client.post("/api/penny/speech", json={"text_id": b["text_id"]}).status_code == 403  # no consent
    client.patch("/api/user/preferences", json={"share_with_elevenlabs_consent": True})
    r = client.post("/api/penny/speech", json={"text_id": b["text_id"]})
    assert r.status_code == 503
    assert client.post("/api/penny/speech", json={"text_id": "deadbeefdeadbeef"}).status_code == 404
    st = {i["id"]: i["status"] for i in client.get("/api/integrations/status").json()["integrations"]}
    assert st["elevenlabs_tts"] == "not_connected" and st["n8n_events"] == "not_connected"
    assert "connected" not in (st["work_calendar"], st["bank_account"])


def test_scheduled_monitoring_flow(client):
    assert client.post("/api/demo/queue-event", json={"kind": "shift"}).json()["queued"]
    p = client.get("/api/integrations/pending", headers=H).json()
    assert p["count"] == 1
    client.post("/api/integrations/events", json=p["events"][0], headers=H)
    assert client.get("/api/integrations/pending", headers=H).json()["count"] == 0
    r1 = client.post("/api/monitoring/check", json={"via": "n8n"}, headers=H).json()
    r2 = client.post("/api/monitoring/check", json={"via": "n8n"}, headers=H).json()
    assert r1["status"] == "red" and r2["alert_created"] is False
    st = {i["id"]: i["status"] for i in client.get("/api/integrations/status").json()["integrations"]}
    assert st["n8n_schedule"] == "connected"


def test_reset_restores_initial_state(client):
    client.post("/api/demo/simulate-shift-cancellation")
    assert at_crit(client) == -6000
    client.post("/api/demo/reset")
    assert at_crit(client) == 3000
    assert client.get("/api/demo/events").json()["events"] == []


def test_family_estimate_uses_decimal(client):
    r = client.post("/api/family/estimate", json={"amount_minor": 8500, "rate": "2.15", "currency": "AZN", "fee_minor": 199}).json()
    assert r["sender_cost"] == "187.03 AZN" and "illustrative" in r["rate_source"]
