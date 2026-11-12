# n8n workflows for Bridge AI

n8n is Bridge's **detection and orchestration layer**. It receives real-world financial events (a cancelled shift, a revised bill), validates them, delivers them to the Runway backend, and runs scheduled risk checks so Bridge works without anyone pressing a button.

| File | Workflow | Trigger |
|---|---|---|
| `workflow_financial_events.json` | **Bridge AI — Financial shock detection** | Webhook `POST /bridge-financial-events` |
| `workflow_scheduled_monitoring.json` | **Bridge AI — Scheduled financial monitoring** | Schedule (every minute for the demo; switch to daily) |

Both workflows have their timezone set to **Europe/London** and save every execution, so judges can open *Executions* and see what ran.

## 1. Workflow 1 — Financial shock detection

```
Webhook (Header Auth) → Validate & transform (Code) → Event valid?
   ├─ true  → Send event to Bridge backend (HTTP, Header Auth) → Respond with Bridge result
   └─ false → Reject malformed event (HTTP 400)
```

* The webhook only accepts requests carrying the `X-Bridge-Secret` header (n8n Header Auth credential). Unauthorised requests are rejected by n8n before any node runs.
* The Code node checks required fields per event type, requires money as **integer pence** (`amount_minor`, `old_amount_minor`, `new_amount_minor`), and forwards only known fields.
* The backend (`POST /api/integrations/events`) checks the secret again, **deduplicates by `event_id`**, updates the ledger with provenance (`source via n8n`), recalculates Runway and raises an alert if risk changed. Its JSON result is returned to the caller as `bridge_result`.

Example payloads (exactly what the Bridge demo panel sends):

```json
{ "event_id": "evt_demo_shift_cancel_2026_11_21", "user_id": "user_amira", "event_type": "shift_cancelled",
  "shift_id": "shift_2026_11_21", "event_date": "2026-11-07", "amount_minor": 9000, "currency": "GBP",
  "source": "demo_work_calendar" }
```
```json
{ "event_id": "evt_demo_electricity_notice_nov", "user_id": "user_amira", "event_type": "bill_updated",
  "bill_id": "bill_electricity_nov", "old_amount_minor": 3500, "new_amount_minor": 6000,
  "due_date": "2026-11-22", "currency": "GBP", "source": "demo_energy_notice" }
```

## 2. Workflow 2 — Scheduled monitoring

```
Schedule → Config → Fetch pending integration events (GET /api/integrations/pending)
   → Any new events?
       ├─ true  → One item per event → Deliver event to Bridge → Run risk check (after events)
       └─ false → Run risk check (no new events)
```

* "Pending events" is Bridge's integration inbox — where calendar/bill adapters drop events. In the demo, the presenter fills it with **Presenter → Scheduled path → Queue shift cancellation / Queue bill notice**. Within a minute n8n picks them up, the dashboard updates (it polls every 8 s) and the event log shows `via n8n`.
* `POST /api/monitoring/check` recalculates risk, creates an alert only if the (risk, projected balance) state is new — **no duplicate alerts** — respects the user's notification and check-in preferences, and records the run (visible in the Presenter panel and in Settings → n8n scheduled monitoring).
* For a realistic deployment change the Schedule node to **Days → 1, trigger at hour 8**.

## 3. Set up (about 5 minutes)

1. **Run n8n.** Either `docker compose up n8n` from the repo root (uses `GENERIC_TIMEZONE=Europe/London`), or `npx n8n`. Open http://localhost:5678.
2. **Create one credential**: *Credentials → New → Header Auth*
   * Name: `Bridge shared secret`
   * Header name: `X-Bridge-Secret`
   * Header value: the same value as `N8N_SHARED_SECRET` in the backend `.env` (demo default: `bridge-demo-secret`).
3. **Import** both files: *Workflows → Import from file*.
4. In each imported workflow, open every node showing a credential warning (the Webhook and all *HTTP Request* nodes) and select **Bridge shared secret**. The exports deliberately contain no credentials or secrets.
5. **Backend address.** Open the *Validate & transform* node (workflow 1) and the *Config* node (workflow 2) and set `BACKEND_URL`:
   * n8n in Docker, backend on your machine → `http://host.docker.internal:8000` (default)
   * n8n via `npx n8n` on the same machine → `http://localhost:8000`
   * Backend deployed → its public `https://` URL (keep the shared secret set).
6. **Publish/activate** both workflows (toggle *Active* / *Publish*, depending on your n8n version).
7. Put the **production** webhook URL in the backend `.env` and restart the backend:
   ```
   N8N_WEBHOOK_URL=http://localhost:5678/webhook/bridge-financial-events
   ```

### Test URL vs production URL

| | URL | When it works |
|---|---|---|
| **Test** | `…/webhook-test/bridge-financial-events` | Only while you have clicked *Listen for test event* / *Execute workflow* in the editor; handles **one** request and shows data live in the canvas. Good for debugging. |
| **Production** | `…/webhook/bridge-financial-events` | Whenever the workflow is **active/published**. Executions appear under *Executions*. Use this for the demo. |

## 4. Test it

With the backend running:

```bash
# Should return 401 from n8n (no secret)
curl -i -X POST http://localhost:5678/webhook/bridge-financial-events -H 'Content-Type: application/json' -d '{}'

# Malformed event → 400 with a list of errors
curl -s -X POST http://localhost:5678/webhook/bridge-financial-events \
  -H 'X-Bridge-Secret: bridge-demo-secret' -H 'Content-Type: application/json' -d '{"event_type":"lottery"}'

# Real event → bridge_result.status = "processed"; run it again → "duplicate"
curl -s -X POST http://localhost:5678/webhook/bridge-financial-events \
  -H 'X-Bridge-Secret: bridge-demo-secret' -H 'Content-Type: application/json' \
  -d '{"event_id":"evt_curl_1","user_id":"user_amira","event_type":"shift_cancelled","shift_id":"shift_2026_11_21","amount_minor":9000,"currency":"GBP","source":"curl_test"}'
```

Or simply press **Presenter → Simulate cancelled shift** in the app: the result banner says *Processed by the n8n workflow* and Settings shows *n8n — financial events workflow: Connected and operating*. If n8n is unreachable it says *Local simulation — n8n did NOT run this event*, and Settings shows *Unavailable* — Bridge never claims n8n ran when it didn't.

Reset between rehearsals with **Presenter → Reset demo**.

## 5. Security notes

* Secrets live only in the n8n credential store and the backend `.env`. Nothing secret is in these JSON files.
* Both directions are authenticated with `X-Bridge-Secret`; the backend compares it in constant time.
* Event IDs make delivery idempotent, so n8n retries are safe.
* Before exposing the backend publicly, set a long random `N8N_SHARED_SECRET` and `DEMO_MODE=false` (demo controls are not meant for public deployment).
