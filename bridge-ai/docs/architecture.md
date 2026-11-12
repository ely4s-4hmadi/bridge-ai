# Architecture

> **n8n detects. Runway calculates. Penny explains. The user decides.**

```
 Work calendar / bill notices / (future: bank, payroll)
            │  user-authorised events (fictional in the demo)
            ▼
 ┌──────────────────────┐   X-Bridge-Secret    ┌──────────────────────────────────────────┐
 │ n8n                  │ ───────────────────▶ │ FastAPI backend                           │
 │ • Webhook workflow   │                      │ • Event processor (validate, dedupe,      │
 │ • Schedule workflow  │ ◀─── pending inbox ── │   provenance, apply to ledger)            │
 └──────────────────────┘                      │ • SQLite (profile, ledger, events,       │
                                               │   alerts, action status, monitoring runs) │
                                               │ • Runway forecast engine (pence, rules)   │
                                               │ • Risk detection (documented rules)       │
                                               │ • Rescue-plan engine (deterministic)      │
                                               │ • Penny service (briefings, chat, tools)  │
                                               │ • ElevenLabs service (TTS, agent token)   │
                                               └───────────────┬──────────────────────────┘
                                                               │ REST /api/*
                                               ┌───────────────▼──────────────────────────┐
                                               │ React + TypeScript + Tailwind + Recharts │
                                               │ Home · Runway · Plan · Settings ·         │
                                               │ Presenter panel                           │
                                               │ @elevenlabs/react ConversationProvider    │──▶ ElevenLabs agent (WebRTC)
                                               │   client tools ──▶ /api/penny/tools/*     │     calls tools back in the browser
                                               └──────────────────────────────────────────┘
```

## Roles

| Part | Responsibility | Why it lives there |
|---|---|---|
| **n8n** (`n8n/`) | Receives events, validates them, authenticates, forwards to Bridge, returns a structured result; polls the integration inbox on a schedule and triggers risk checks. Execution history is visible in n8n. | Integrations change often and differ per source (rota apps, energy suppliers, banks). A visual, retryable workflow layer lets new sources be added without redeploying the forecasting core, and gives operators an audit trail. |
| **Runway** (`backend/app/services/forecasting.py`) | Deterministic daily cash-flow forecast in integer pence; scenarios on deep copies; critical payment; uncovered essentials. | Money maths must be exact, testable and explainable — never an LLM. |
| **Risk detection** (`risk_detection.py`) | Green / amber / red from published rules using the user's own safety buffer. | No hidden score; every status lists the reasons that triggered it. |
| **Rescue plan** (`recommendation_engine.py`, `seed/support_resources.json`) | Rule-based actions with impact (computed by Runway where possible, otherwise "Impact not yet known"), limitations, drafts, verified free-advice links. | Safety-critical advice must be predictable. |
| **Penny** (`penny_service.py`, `elevenlabs_service.py`, `frontend/src/components/Penny.tsx`) | Briefings and typed answers from templates filled with Runway numbers; ElevenLabs TTS; live ElevenLabs agent whose five client tools call the backend. | Voice makes the forecast accessible; tools keep every number grounded. |
| **Frontend** (`frontend/`) | Four screens, presenter panel, honest connection states, accessibility. Polls every 8 s so scheduled n8n changes appear on their own. | |

## Key flows

**Demo button → n8n → dashboard.** `POST /api/demo/simulate-shift-cancellation` → backend posts the event to `N8N_WEBHOOK_URL` with the secret → n8n validates and calls `POST /api/integrations/events` with `X-Bridge-Via: n8n` → backend dedupes, updates the ledger, recomputes, raises an alert → n8n responds with `bridge_result` → frontend refreshes. If n8n is unreachable the backend processes the same event locally and labels it `local_simulation`.

**Scheduled monitoring.** Presenter queues an event into the inbox → n8n Schedule (1 min) fetches `GET /api/integrations/pending` → delivers each event → `POST /api/monitoring/check` → frontend picks up the change on its next poll. No button press required after queuing.

**Live voice.** User presses the mic → consent check → `getUserMedia` → backend fetches a conversation token → `startSession({conversationToken, connectionType: "webrtc"})` → agent calls e.g. `run_what_if_scenario` → browser calls `POST /api/penny/tools/run_what_if_scenario` → Runway result returned to the agent → Penny speaks it.

## Data model

All in `backend/app/models.py`. `LedgerItem` (id, direction, category, amount_minor, date, status = confirmed | expected | cancelled, essential, source/provenance, shift_id, bill_id, updated_at), `UserProfile`, `UserPreferences`, `Forecast`, `ForecastDay`, `FinancialEventIn`, `ScenarioIn`. Events, alerts, action statuses and monitoring runs are SQLite tables (`database.py`).

## Forecast rules (Runway)

* Opening balance = balance at the start of the reference date; items dated earlier are treated as already settled (no double counting).
* `closing(d) = closing(d−1) + income(d) − payments(d)`; cancelled items never count.
* **Critical payment** = first rent payment in the horizon (else the largest essential payment).
* **Uncovered essential** = an essential payment on a day whose closing balance is below £0.
* **Downside** = only *confirmed* income arrives (Amira's £90 rota shift is "expected", her £300 for hours already worked is "confirmed").
* Scenarios always work on a deep copy; the base case is never modified. Income added after the critical date is flagged as not preventing that shortfall.

## Production path (not built)

Per-user auth (OAuth/OIDC) and row-level permissions; Open Banking AIS via a regulated aggregator replacing the fictional balance; rota/payroll and energy adapters writing to the same inbox; Postgres with encryption at rest; secrets in a vault; n8n queue mode for scale; consent records per data source.
