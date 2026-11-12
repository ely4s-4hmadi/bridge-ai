# Privacy, safety and responsible AI

Bridge is designed for people who cannot afford financial surprises — often people who are already stressed, may have limited English or financial confidence, and may be wary of banks. That shapes every design decision.

## What the prototype does

| Principle | How it is implemented |
|---|---|
| **Fictional data only** | Amira and every figure are invented (`backend/app/seed/amira.py`). The app shows "Demo · fictional data" on every screen. No bank credentials are ever requested. |
| **No secrets in the browser** | ElevenLabs keys and the n8n shared secret live only in the backend `.env` / n8n credential store. The browser receives a short-lived conversation token, never the API key. `.env` is git-ignored; `.env.example` has placeholders only. |
| **Authenticated automation** | `POST /api/integrations/events`, `GET /api/integrations/pending` and `POST /api/monitoring/check` require `X-Bridge-Secret` (constant-time compare). The n8n webhook also requires it. |
| **Validated, idempotent events** | Pydantic schemas with integer-pence bounds; event types are an allow-list; `old_amount_minor` must match the current bill; duplicate `event_id`s are reported as duplicates and change nothing. |
| **Consent before sharing** | Nothing is sent to ElevenLabs until the user turns on *Allow ElevenLabs voice*, after a plain-English explanation of what is sent. Withdrawing consent stops both TTS and live voice. |
| **No surprise audio, no surprise recording** | Audio never autoplays; the microphone is requested only after the user presses it; mute and end controls are always visible during a call. |
| **Minimal retention** | Bridge stores no audio. Typed-chat transcripts stay in the browser tab and disappear on reload. (ElevenLabs' own retention settings apply to live calls — configure them in the agent.) |
| **Minimal logging** | The backend does not log request bodies or balances. |
| **Honest status** | Connections only show "Connected and operating" after a real successful call. Local fallbacks are labelled "local simulation — n8n did NOT run this event". |
| **Forecasts, not judgements** | Risk colours follow published rules shown in the app, with the user's own safety buffer. The UI says the colour is "not a credit score and not a judgement about you". Penny says "this is a forecast, not a certainty". |
| **No fabricated help** | Support links are a small curated list of established free services (MoneyHelper, Citizens Advice, StepChange, UKCISA). No invented local schemes, deadlines or URLs. Eligibility is never promised, and international students are warned about "no recourse to public funds" before applying for public support. |
| **No invented savings** | Impacts are calculated by Runway or shown as "Impact not yet known". |
| **Safe advice boundaries** | Bridge never suggests skipping food, heating, medication or housing; never suggests high-cost credit; never treats moving money between pots as a fix. |
| **User stays in control** | Bridge never sends messages, moves money or contacts landlords, employers or family. Drafts are editable and only copied by the user. |
| **Not regulated advice** | Clear caveat on the Plan screen and in Penny's prompt: general information, not regulated financial, legal or immigration advice. |

## What it does **not** do yet (would be required before real users)

* Real user accounts, authentication, per-user authorisation and audit logs.
* Encryption at rest, managed secrets, rate limiting, abuse monitoring.
* A DPIA, a lawful basis and consent records per data source; data-subject access and deletion flows.
* Testing with real users, including people with lived experience of financial hardship, and accessibility testing with assistive-technology users.
* Regulatory review (e.g. whether any feature amounts to regulated advice or debt counselling) and partnership with accredited advice providers.
* Multilingual voice testing — only English is enabled; other languages are listed as "planned, not yet tested".

## If the forecast is wrong

Forecasts are only as good as the data Bridge knows about. Bridge shows the balance timestamp, distinguishes confirmed and unconfirmed income, shows a downside range, and phrases outcomes as "could" and "may". Actions recommended for a red forecast (talk to the landlord early, ask about shifts, contact a free adviser) are low-regret even if the shortfall does not happen.
