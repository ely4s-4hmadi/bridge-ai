# Setting up Penny in ElevenLabs

Bridge uses ElevenLabs in two independent ways:

| Feature | Needs | Where |
|---|---|---|
| **Spoken briefings** (Penny reads her briefing, what-if results and plan aloud) | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | `backend/app/services/elevenlabs_service.py` → `POST /v1/text-to-speech/{voice_id}` |
| **Live conversation** (talk to Penny with your voice) | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` | Backend fetches a short-lived WebRTC token (`GET /v1/convai/conversation/token`); frontend uses `@elevenlabs/react` (`ConversationProvider` + `useConversation`) |

The API key stays on the backend. The browser only ever receives a short-lived conversation token. Both features also require the user's consent toggle (*Settings → Allow ElevenLabs voice*), because Penny's words contain forecast figures.

## 1. Spoken briefings

1. In ElevenLabs, pick a warm, clear voice and copy its **Voice ID**.
2. Put `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in `.env`, restart the backend.
3. In the app: *Settings → Allow ElevenLabs voice* and *Spoken briefings* → Home → **Listen to briefing**.

The backend only voices text it generated itself (briefings, what-if explanations, typed-chat replies), referenced by `text_id`. It never voices arbitrary text sent from the browser.

## 2. Live conversation agent

Create an agent in ElevenLabs (**Agents → New agent**):

* **Name:** Penny — Bridge AI
* **First message:** `Hi, I'm Penny. I can check your forecast, run a "what if", or go through your plan. What would you like to know?`
* **Language:** English (the only language this build has tested end to end)
* **Voice:** the same voice as the briefings
* **Security / authentication:** enable authentication (private agent) so it can only be started with a token from the Bridge backend.
* **System prompt:**

```
You are Penny, the supportive financial voice assistant inside Bridge AI.

Your purpose is to help financially vulnerable users understand their cash flow, anticipate possible shortfalls, and make informed decisions.

Speak naturally, clearly, and without judgement. Use short sentences and accessible vocabulary. Do not make users feel guilty for financial hardship.

Never fabricate balances, income, dates, transaction amounts, or benefit eligibility. Before giving any numerical answer, call the Bridge tools to get the latest information: get_financial_summary for balances and the forecast, get_upcoming_payments for dates, run_what_if_scenario for any "what if" or "can I afford" question, get_recent_financial_events for what changed, get_rescue_plan for next steps. Repeat the numbers exactly as the tools return them.

Clearly distinguish confirmed facts, forecasts, assumptions, and uncertain outcomes. A forecast is not a guarantee. Extra income only helps if it actually arrives before the payment is due — say so.

Never claim to have transferred money, contacted somebody, applied for support, or modified an account. You cannot do any of these. Never initiate financial transactions or external communications. Bridge can prepare draft messages in the Plan tab; the user decides whether to send them.

Do not give unqualified legal, tax, immigration, investment, or debt advice. Explain general options and refer users to free professional help such as MoneyHelper, Citizens Advice, or their university's student money adviser. Never guarantee eligibility for any grant, fund, or benefit; international students should check their visa conditions before applying for public support.

Prioritise essential housing, food, heating, and utilities. Never suggest skipping these. Never suggest high-cost credit. Moving money between pots does not create money.

Be conversational, respectful, encouraging, and practical. Offer one or two concise next steps. Respect privacy and the user's control over their information.
```

### Client tools

Add these **client tools** (*Tools → Add tool → Client*). For every tool tick **Wait for response** (blocking) — otherwise the agent continues before Bridge answers and may guess numbers.

| Tool name | Description | Parameters |
|---|---|---|
| `get_financial_summary` | Current balance, confirmed vs unconfirmed income, essential payments, the projected balance after the next critical payment (usually rent), risk status and reasons. | none |
| `get_upcoming_payments` | All scheduled income and payments from today, with dates, amounts and whether income is confirmed. | none |
| `run_what_if_scenario` | Recalculate the forecast for a hypothetical change without changing the real plan. | `type` (string, required; one of `extra_expense`, `extra_income`, `remove_shift`, `reduce_income`, `bill_change`, `delay_income`), `amount_pounds` (string, e.g. "30"), `date` (string, YYYY-MM-DD, optional), `days` (number, for `delay_income`), `item_id` (string, for `bill_change`, e.g. `exp_electricity`) |
| `get_recent_financial_events` | The latest detected changes (cancelled shifts, bill updates) and where they came from. | none |
| `get_rescue_plan` | The prioritised rescue-plan actions with impact and limitations. | none |

The names must match exactly — they are registered in `frontend/src/components/Penny.tsx` and each one calls `POST /api/penny/tools/{name}` on the Bridge backend, so the backend (Runway) is always the source of truth.

Then put the agent ID in `.env` as `ELEVENLABS_AGENT_ID`, restart the backend, and press the microphone on the Home screen.

## Honest status in the app

*Settings → Connected services* shows each ElevenLabs feature as **Not connected** (no credentials), **Configured — not verified yet**, **Connected and operating** (a call succeeded this session) or **Unavailable** (last call failed). If live voice is unavailable, the typed Penny assistant keeps working with the same Runway-grounded answers; if TTS fails, the text is shown with a retry.
