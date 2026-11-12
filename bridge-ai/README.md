# Bridge AI

**Don't just track your money. Protect your future.**
Team QuadCore · GreatUniHack 2026, Manchester

Bridge AI is a proactive, voice-first financial safety net. It **detects** real-life financial changes (a cancelled shift, a bigger bill), **predicts** cash shortages day by day before they happen, and **helps** people act early — with a voice assistant, Penny, who explains everything in plain language.

> n8n detects. Runway calculates. Penny explains. The user decides.

Challenges: NatWest — AI-Powered Financial Inclusion & Resilience · ElevenLabs — Best Use of ElevenLabs · n8n — Best Use of n8n · Overall.

---

## The problem

People on zero-hours contracts, part-time shift workers and international students often struggle not because they budget badly but because income is unpredictable and essential bills can't wait. Banking apps show what *happened*. Bridge shows what's *coming* — "you could be £85 short when rent is due on 1 December" — three weeks before it happens, and what you can do about it.

**Target users:** irregular-income workers, low-income households, working students, international students with irregular income and cross-border family support, and anyone uncomfortable with conventional banking apps.

## Key features

| | |
|---|---|
| **Home — Talk to Penny** | Safety indicator (green/amber/red, with published rules and reasons), balance after rent, next payday, critical payment, microphone for live voice, typed alternative, daily spoken briefing, "What changed" with provenance. |
| **Runway — My financial future** | Day-by-day step chart (with accessible table view), shortfall date, confirmed vs unconfirmed income, downside range, "financial time travel" what-ifs with timing checks, Penny can read results aloud. |
| **My Rescue Plan** | Three prioritised actions with why, calculated or "not yet known" impact, limitations, next step, status tracking, editable drafts (landlord, employer, adviser, family), verified free-advice links. Optional family-assistance planner. |
| **Connections & preferences** | Honest connection states, voice consent, tone (gentle/direct/encouraging), safety buffer, alerts, check-in schedule, language (English tested; others marked planned), family planner, event history. |
| **Presenter panel** | Reset, simulate cancelled shift, simulate higher bill (through n8n when connected), queue events for the scheduled workflow, local risk check, event and monitoring logs. |

## Architecture

```
Work calendar / bills ─▶ n8n (webhook + schedule) ─▶ FastAPI ─▶ SQLite
                                                     │  Runway forecast · risk rules · rescue plan · Penny
                                                     ▼
                                     React app ◀──▶ ElevenLabs (TTS + live agent with Bridge client tools)
```
Details: [docs/architecture.md](docs/architecture.md).

**Tech:** Python 3.11+, FastAPI, Pydantic v2, SQLite, HTTPX, pytest · React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, lucide-react, `@elevenlabs/react` · n8n.

## Repository

```
backend/    FastAPI app (app/services/forecasting.py is Runway), seed data, tests
frontend/   React app (src/pages, src/components, src/hooks, src/services)
n8n/        Two importable workflows + setup guide
docs/       architecture, demo script, pitch & Devpost, privacy & ethics, testing, ElevenLabs agent setup
```

## Local setup

**Requirements:** Python 3.11+ and Node.js 20+. Optional: Docker (for n8n), an ElevenLabs account.

```bash
cp .env.example .env            # works as-is in demo mode

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000              # API docs: http://localhost:8000/docs

# Frontend (new terminal)
cd frontend
npm install
npm run dev                                            # http://localhost:5173
```

The database is created and seeded with the fictional user Amira automatically on first start. **Presenter → Reset demo** (or `POST /api/demo/reset`) restores the initial state at any time.

### n8n (optional but needed for the "via n8n" path)
`docker compose up n8n` (or `npx n8n`), then follow [n8n/README.md](n8n/README.md): create the *Bridge shared secret* Header Auth credential, import both workflows, set the backend URL, activate, and put the production webhook URL in `.env` as `N8N_WEBHOOK_URL`.

### ElevenLabs (optional but needed for Penny's voice)
Set `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` for spoken briefings and `ELEVENLABS_AGENT_ID` for live conversation. Agent prompt and the five client tools: [docs/elevenlabs-agent-setup.md](docs/elevenlabs-agent-setup.md). In the app, turn on *Settings → Allow ElevenLabs voice*.

| Variable | Needed for |
|---|---|
| none | Full forecast, what-ifs, rescue plan, typed Penny, local simulation of events |
| `N8N_WEBHOOK_URL`, `N8N_SHARED_SECRET` | Demo buttons going through n8n; scheduled workflow auth |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Spoken briefings / read-aloud |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` | Live voice conversation |
| `LLM_API_KEY` | Not used in this build (explanations are deterministic templates) |

## Demo flow

Reset → Amira has **£30** left after rent (amber: below her £50 safety buffer, and only £300 of her income is confirmed) → **Simulate cancelled shift** (−£60) → **Simulate higher electricity bill** (**−£85, red**) → **Listen to briefing** → ask "Can I afford to spend £30 this weekend?" (**−£115**) → "What if I work an extra £100 shift before rent is due?" (**£15**) → Plan tab. Full script: [docs/demo-script.md](docs/demo-script.md).

## Tests

```bash
cd backend && python -m pytest -q        # 28 tests: Runway arithmetic, scenarios, API, events, dedupe, voice fallbacks
cd frontend && npm test                  # money formatting/parsing
cd frontend && npm run build             # type-check + production build
```
What was run and what wasn't: [docs/testing.md](docs/testing.md).

## Troubleshooting

* **Frontend shows "Can't reach the Bridge server"** — start the backend on port 8000 (Vite proxies `/api` there; set `BACKEND_URL` to change it).
* **Demo buttons say "Local simulation"** — `N8N_WEBHOOK_URL` is empty or n8n is unreachable; Settings shows the exact reason.
* **n8n returns 401/403** — the Header Auth credential value must equal `N8N_SHARED_SECRET` (demo default `bridge-demo-secret`), and every HTTP node must use it.
* **n8n can't reach the backend** — in Docker use `http://host.docker.internal:8000` (compose file adds the host mapping on Linux); with `npx n8n` use `http://localhost:8000`.
* **"Voice needs your consent"** — turn on *Settings → Allow ElevenLabs voice*.
* **Microphone blocked** — allow it in the browser's site settings; typed Penny keeps working.
* **Weird state** — Presenter → Reset demo, or delete `backend/bridge.db`.

## Limitations (honest)

* Hackathon prototype with one fictional user, no login, SQLite storage — **not** for real financial accounts.
* No real bank, payroll or energy integrations; those sources are labelled *Demo simulation*.
* Only English is enabled; other languages are planned but untested.
* The optional external LLM is not implemented — all wording comes from deterministic templates.
* The live ElevenLabs agent and the n8n round trip require your own accounts to verify; see docs/testing.md for what we could and couldn't run.

## Future development

Open Banking via a regulated aggregator · rota/payroll and supplier adapters as n8n workflows · tested multilingual Penny · co-design with student money advisers and people with lived experience · per-user accounts, encryption and audit · pay-history-based uncertainty ranges once real data exists.

## Responsible AI & privacy

Deterministic money maths, published risk rules, consent before voice, no autoplay or hidden recording, no automatic contact with anyone, no invented eligibility or savings, verified free-advice links only. See [docs/privacy-and-ethics.md](docs/privacy-and-ethics.md).

*Not affiliated with NatWest or any bank. General information only — not regulated financial, legal or immigration advice.*
