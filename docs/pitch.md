# Bridge AI — pitch, Devpost text and judge Q&A

**Tagline:** Don't just track your money. Protect your future.
**Secondary:** Financial help before financial crisis.
**Principle:** Detect → Predict → Help.

**One sentence.** Bridge AI is a proactive, voice-first financial safety net that detects real-life financial changes, predicts cash shortages before they happen, and guides vulnerable users towards practical solutions.

---

## Devpost submission

### Project title
Bridge AI — financial help before financial crisis

### Short description
An early-warning system for people who can't afford financial surprises. n8n detects changes like a cancelled shift or a higher bill, our Runway engine forecasts every day until rent is due, and Penny — an ElevenLabs voice assistant — explains what it means and helps the user plan, without ever taking control away from them.

### Inspiration
Several of us are international students who work part-time. A cancelled shift or a surprise bill doesn't feel like a "budgeting" problem — it's a rent-day problem you discover too late. Banking apps are excellent at showing what already happened. We wanted something that looks forward, speaks plainly, and helps before a payment fails.

### What it does
* **Detect (n8n).** A webhook workflow receives authenticated events (shift cancelled, bill updated), validates them and delivers them to Bridge; a scheduled workflow polls Bridge's integration inbox and runs risk checks every minute in the demo (daily in real use). Every change carries its provenance — "via n8n" or, if n8n is down, a clearly labelled local simulation.
* **Predict (Runway).** A deterministic, integer-pence forecasting engine calculates the projected balance for every day until rent, finds the first shortfall, flags essential payments that may not be covered, and shows a range between confirmed income only and everything expected. "What if" scenarios (spend £30, extra shift, bill up £20, wages three days late) run on a copy of the ledger and check timing — money that arrives after rent doesn't fix a rent-day shortfall.
* **Help (Penny + Rescue plan).** Penny gives a spoken daily briefing via ElevenLabs text-to-speech and holds live voice conversations through an ElevenLabs agent whose tools call Runway — so every number she says is calculated, not generated. The Rescue plan prioritises practical steps (contact the landlord early, ask about shifts, free advice from MoneyHelper / Citizens Advice / university advisers) with calculated impact where possible, honest "impact not yet known" where not, limitations, and editable message drafts the user sends themselves.
* In the demo, Amira's £30 buffer becomes a projected **£85 shortfall on 1 December** after two events; "can I spend £30 this weekend?" → **−£115**; "an extra £100 shift before rent" → **£15**.

### How we built it
React + TypeScript + Vite + Tailwind + Recharts on the front end; FastAPI + Pydantic + SQLite on the back end; n8n for event orchestration and scheduled monitoring; ElevenLabs text-to-speech and the `@elevenlabs/react` conversational SDK with client tools; pytest and Vitest for tests.

### Challenges
* Keeping the voice agent honest: we made the backend the single source of truth and exposed it to the agent as blocking client tools, so the agent fetches numbers instead of inventing them.
* Modelling uncertain income without pretending to statistics we don't have — we use explicit confirmed/expected status and a transparent downside instead of invented confidence intervals.
* Building honest fallbacks: every external dependency has a "not connected / unavailable" state, and the demo never claims n8n or ElevenLabs ran when they didn't.

### Accomplishments
* Every headline number in the demo (£30, −£60, −£85, −£115, £15, and "late money doesn't help") is pinned by automated tests.
* Idempotent, authenticated event pipeline with provenance and no duplicate alerts.
* Four accessible screens with a table alternative for the chart, keyboard navigation, reduced-motion support, and typed alternatives to voice.

### What we learned
Trust is the product. Clear rules, honest uncertainty and "you decide" matter more to vulnerable users than clever predictions.

### What's next
Open Banking balance and transactions through a regulated provider; real rota and energy-supplier adapters into the same n8n inbox; tested multilingual Penny (Urdu, Arabic, Polish, Romanian); co-design with student money advisers; per-user accounts and security hardening.

### Built with
python, fastapi, pydantic, sqlite, pytest, react, typescript, vite, tailwindcss, recharts, n8n, elevenlabs

### Challenges entered
NatWest — AI-Powered Financial Inclusion & Resilience · ElevenLabs — Best Use of ElevenLabs · n8n — Best Use of n8n · GreatUniHack Overall

---

## Judge Q&A

**How is Bridge different from a budgeting app?** Budgeting apps categorise the past. Bridge forecasts the next weeks day by day, reacts automatically to real changes, tells you the date and size of a possible shortfall, and helps you act before it happens.

**Where is the AI?** Three places, each doing what it's good at. Conversational AI (ElevenLabs agent) understands spoken questions and explains results naturally. Voice synthesis makes the forecast accessible to people who find banking apps stressful. Automated detection (n8n) turns life events into structured data. We deliberately did *not* give arithmetic or risk scoring to an LLM — those are deterministic and tested, because a wrong number in this context harms people.

**What does n8n do that Python alone doesn't?** Integrations are the part that changes most. n8n gives a visual, retryable, observable pipeline per source — auth, validation, transformation, scheduling and execution history — that non-backend teammates can extend without redeploying the forecasting core. The backend stays small and exact.

**Why is ElevenLabs central rather than optional?** Our users are people who avoid financial screens, have lower literacy or are working in a second language. A calm voice that answers "can I afford this?" in one sentence is the interface for them. And because the agent calls Bridge tools, the voice experience is grounded in real data rather than being a chatbot bolted on.

**How do you know the calculations are correct?** Integer pence, no floats, one documented formula, and 28 backend tests including every demo figure, timing edge cases, precision, duplicates and malformed events. The UI's "Show as table" view lets anyone check each day by hand.

**How are irregular incomes modelled?** Each income item is confirmed (hours already worked) or expected (a future rota shift). The headline uses everything expected; the downside uses confirmed only; both are shown. Scenarios let users test lost or extra shifts and late pay. With no pay history we say so rather than inventing confidence intervals.

**How do you protect vulnerable users?** Non-judgemental language, published risk rules, no autoplay or hidden recording, consent before data goes to ElevenLabs, no automatic contact with anyone, no high-cost credit suggestions, never cutting essentials, verified free-advice links only, and explicit caveats about eligibility — including public-funds restrictions for international students.

**What if the forecast is wrong?** It's labelled as a forecast with its timestamp and range. The suggested actions — talk early, ask about shifts, get free advice — are low-regret even if the shortfall doesn't happen. Users can correct inputs and the forecast recalculates instantly.

**How would real integrations work?** Each source becomes an n8n workflow writing the same event schema into Bridge: Open Banking (via a regulated aggregator) for balances and transactions, rota apps or payroll exports for shifts, supplier emails/APIs for bills — each behind explicit user permission.

**Is this regulated advice?** No. Bridge gives general information and calculations from the user's own data and points to free regulated/accredited advice services. A real launch would need regulatory review and partnerships with advice providers.

**What if the internet fails?** The forecast is computed by our backend, so the dashboard keeps working without n8n or ElevenLabs; voice falls back to text and automation shows "unavailable". Fully offline would need on-device calculation — Runway is small enough to port.

**How would it scale?** Stateless API, Postgres, per-user auth, n8n queue mode with workers, event IDs for idempotency, and forecasts recomputed only when a user's events change.

**Why international students and irregular-income workers?** They combine variable income, fixed essential costs, little buffer and often language or system barriers — and some have no access to public funds, so early warning matters even more.

**How do you measure whether Bridge helps?** See impact hypotheses below.

**How would this work in a bank?** As an early-warning layer on top of account data the bank already has: a forecast and a calm voice check-in before an essential payment fails, with routes to the bank's own financial-support team and to free advice — reducing missed payments and the need for collections.

---

## Impact hypotheses (to test — not claimed results)

| Measure | What it tells us |
|---|---|
| Days of warning before a predicted shortfall | Does Bridge give enough time to act? (Demo: 24 days.) |
| Precision/recall of predicted essential-payment shortfalls vs actual outcomes | Is the forecast trustworthy? |
| % of red/amber alerts opened, and time to open | Do people engage with warnings? |
| % of users who start at least one plan action (draft copied, adviser contacted) | Does insight turn into action? |
| Number of relevant support options shown per at-risk user | Are we connecting people to help? |
| Comprehension check ("When might you be short and by how much?") | Do people understand the forecast, with and without voice? |
| Self-reported financial stress before/after | Does early warning reduce anxiety rather than add to it? |

The prototype has not been tested with real users and has not prevented any real debt.
