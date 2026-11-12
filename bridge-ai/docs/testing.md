# Testing — what was run, and what wasn't

Last run: 7 November 2026, Linux, Python 3.13, Node 22.

## Automated

| Suite | Command | Result |
|---|---|---|
| Backend: Runway unit tests (`tests/test_forecasting.py`) | `cd backend && python -m pytest -q` | **15 passed** |
| Backend: API integration tests (`tests/test_api.py`) | same run | **13 passed** (28 total) |
| Frontend: money formatting/parsing (`src/lib/money.test.ts`) | `cd frontend && npm test` | **3 passed** |
| Frontend: type-check + production build | `cd frontend && npm run build` | **passes** (one bundle-size warning) |

### Financial tests (all pinned to exact pence)
Original Amira forecast **£30** · cancelled shift **−£60** · both shocks **−£85** on 1 December with rent £85 uncovered · daily closing balances on every money day · +£30 weekend spend **−£115** · +£100 before rent **£15** · +£100 *after* rent still **−£85** on rent day (recovers to £15 later) · what-ifs never mutate the base case · wages 5 days late · electricity +£20 · lose a shift (and "lose another" when no shift is left) · zero income / negative balances · items before the reference date not double counted · downside = confirmed income only · amber/red/green rules · 1p precision and floats rejected · invalid scenarios rejected.

### API tests
Health and initial forecast · event ingestion requires the shared secret (401) · events update the forecast and are **deduplicated** by `event_id` · malformed events rejected (unknown type, missing ID, wrong old amount, negative amount) with no state change · simulate endpoint incl. timing warning and 422 on bad input · local fallback is labelled · rescue plan order, calculated impact (−£85 → £5), "Impact not yet known", status persistence, drafts · Penny chat answers (−£115, £15, −£85) and briefing facts (£90, £25, £85, 1 December) · tools match Runway · voice honesty (403 without consent, 503 without credentials, 404 for text Bridge didn't generate, statuses never "connected") · scheduled flow (inbox → event → monitoring check, no duplicate alerts, schedule status becomes connected) · reset restores £30 and clears events · family estimate uses Decimal.

## Manual / scripted checks we ran

* **Browser run-through (headless Chrome via Playwright)** of all four screens at 1280 px and 390 px: welcome dialog, presenter panel (reset, shift, bill), Home turns red at −£85, typed Penny "Can I afford £30 this weekend?" → −£115, voice consent dialog, "live voice not set up" notice, briefing text, Runway chart + what-if £15, Plan cards and landlord draft dialog, Settings statuses. **No page errors.** (Google Fonts were blocked in the sandbox, so the system font fallback was used.)
* **Backend n8n code path** with a small stand-in webhook that behaves like the workflow (forwards with the secret and `X-Bridge-Via: n8n`): result labelled *Processed by the n8n workflow*, repeat → *duplicate*, forecast −£85, Settings → n8n events *connected*. Then with the stand-in stopped: *Local simulation — n8n did NOT run this event* and status *Unavailable* with the reason.
* **n8n workflow JSON:** valid JSON; every connection points at an existing node; no secrets inside; node type versions (Webhook 2, Code 2, If 2.2, HTTP Request 4.2, Respond to Webhook 1.1, Schedule Trigger 1.2) and parameter names checked against the published `n8n-nodes-base` 2.15.1 package. The *Validate & transform* JavaScript was executed with Node against a valid and a malformed event and produced the expected outputs.

## Not verified (needs a human with accounts)

* **Importing and executing the workflows inside a real n8n instance.** Installing n8n in our sandbox failed (native module build for a newer Node version), so we could not run an actual n8n execution. Follow `n8n/README.md` §4 to verify; expected outcomes are listed there.
* **ElevenLabs TTS and the live agent.** No API key was available. The code uses the documented endpoints (`/v1/text-to-speech/{voice_id}`, `/v1/convai/conversation/token`) and the `@elevenlabs/react` 1.21 API (`ConversationProvider`, `useConversation`, `startSession({ conversationToken, connectionType: "webrtc" })`, client tools) checked against the installed package types, but no real audio or call was produced.
* Screen-reader testing with real assistive technology, and real-device mobile testing.
