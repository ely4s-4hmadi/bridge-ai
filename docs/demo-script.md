# Demo script

## Before you go on stage

1. Backend and frontend running (see README). n8n running with both workflows **active**, `N8N_WEBHOOK_URL` set. ElevenLabs keys set if you have them.
2. Open the app → **Presenter → Reset demo**.
3. Settings → turn on **Allow ElevenLabs voice** and **Spoken briefings** (only if ElevenLabs is configured).
4. Check Settings → Connected services. Say only what is true on that screen — if n8n shows *Not connected*, the event banner will say "Local simulation", and you should say so.
5. Have a second tab open on the n8n *Executions* list.

## 60-second version

| Time | On screen | Say |
|---|---|---|
| 0–10 s | Home, amber, **£30** | "This is Amira, an international student in Manchester working irregular hospitality shifts. She's careful with money — after rent on 1 December she'll have just £30 left. Bridge already shows amber: that buffer is tiny." |
| 10–20 s | Presenter → **Simulate cancelled shift**, then **Simulate higher electricity bill** | "Her manager cancels a £90 shift. n8n picks up the rota change. Then an energy notice: the bill is £60, not £35." |
| 20–35 s | Home turns **red, −£85**; "What changed" shows both events *via n8n* | "Runway — our deterministic forecasting engine — recalculates every day of her month. £30 left has become an £85 shortfall on the day rent is due. Three weeks of warning instead of a failed payment." |
| 35–45 s | **Listen to briefing** (ElevenLabs) | Let Penny speak: "…you could be £85 short when your rent is due on 1 December…" |
| 45–55 s | Type or say **"What if I work an extra £100 shift before rent is due?"** → **£15**; open **Plan** | "Every number Penny says comes from Runway: £15 left — if that shift is real and paid in time. And here's her plan: talk to her landlord early, ask for shifts, free advice — with drafts she controls." |
| 55–60 s | Back to Home | "Traditional banking apps show you what happened. Bridge helps you see what's coming and act before hardship becomes a crisis." |

## 3–4 minute version (for judging)

1. **Problem (30 s).** Irregular income + bills that can't wait. Budgeting apps look backwards; people find out on rent day.
2. **Detect (45 s).** Show the n8n canvas for *Financial shock detection*: webhook with header auth → validation → backend → structured response. Press **Simulate cancelled shift** and show the new execution in n8n. Press it again: n8n runs, Bridge answers **duplicate**, nothing changes. Then Presenter → *Queue bill notice* and wait up to a minute: the **scheduled** workflow delivers it and Amira's Home turns red on its own.
3. **Predict (45 s).** Runway tab: daily step chart, rent marker, red dot on 1 December. "Show as table" for the accessible view. Stats show confirmed vs unconfirmed income. Run **Spend £30 this weekend** → −£115; **Extra £100 shift** → £15; then a custom extra £100 dated 3 December → still −£85, with the warning that it arrives after rent. Mention the tests that pin all of these numbers.
4. **Help (45 s).** Plan tab: three prioritised cards — each with why, possible effect (calculated where possible, "Impact not yet known" where not), limitations and next step. Open the landlord draft, edit it, copy it. Point out the international-student caveat on public funds. Settings → Family assistance planner (optional, off by default).
5. **Penny (30 s).** Live voice: "Penny, why is my forecast red?" — show that the agent calls `get_financial_summary`, and that if you mute or end, it stops. If live voice is not configured, use the typed box and say so.
6. **Trust (15 s).** Settings → honest connection statuses, event history with provenance.

## Recovery if something fails live

* **n8n down:** the button still works and says "Local simulation — n8n did NOT run this event". Say exactly that.
* **ElevenLabs down:** briefing text appears with a retry; typed Penny keeps working.
* **Anything weird:** Presenter → Reset demo, then repeat.
