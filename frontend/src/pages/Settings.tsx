import { useState, type ReactNode } from "react";
import { useBridge } from "../hooks/useBridge";
import { api } from "../services/api";
import { money, poundsToMinor, timeAgo } from "../lib/money";
import { ConnBadge, ErrorNote, SectionTitle, ViaBadge } from "../components/ui";
import type { Preferences } from "../types";

const LANGS = [
  { code: "en", name: "English", ready: true },
  { code: "ur", name: "Urdu", ready: false },
  { code: "ar", name: "Arabic", ready: false },
  { code: "pl", name: "Polish", ready: false },
  { code: "ro", name: "Romanian", ready: false },
];

export function Settings() {
  const { integrations, user, events, refresh, lastUpdated } = useBridge();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<string | null>(null);
  if (!user) return null;
  const p = user.preferences;

  async function save(change: Partial<Preferences>, label: string) {
    setErr(null);
    try { await api.setPrefs(change); await refresh(); setSaved(label); setTimeout(() => setSaved(null), 1800); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Settings" title="Connections & preferences" />
      <p role="status" aria-live="polite" className="sr-only">{saved ? `${saved} saved` : ""}</p>
      {err && <ErrorNote>{err}</ErrorNote>}

      <section className="card p-5 sm:p-6" aria-labelledby="conn-h">
        <h2 id="conn-h" className="font-display text-lg font-bold">Connected services</h2>
        <p className="mt-1 text-sm text-muted">Bridge only shows “Connected” after a service has actually worked.
          {lastUpdated && <> Checked {timeAgo(lastUpdated.toISOString())}.</>}</p>
        <ul className="mt-4 divide-y divide-line">
          {integrations.map((i) => (
            <li key={i.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="font-medium">{i.name}</p><p className="text-xs text-muted">{i.detail}</p></div>
              <ConnBadge status={i.status} />
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Group title="Voice & Penny">
          <Toggle label="Allow ElevenLabs voice" checked={p.share_with_elevenlabs_consent}
            hint="Lets Bridge send Penny's words (including your forecast figures) and, in live chat, your voice to ElevenLabs."
            onChange={(v) => save({ share_with_elevenlabs_consent: v, ...(v ? {} : { voice_briefings_opt_in: false }) }, "Voice consent")} />
          <Toggle label="Spoken briefings" checked={p.voice_briefings_opt_in} disabled={!p.share_with_elevenlabs_consent}
            hint="Audio never plays automatically — you press play." onChange={(v) => save({ voice_briefings_opt_in: v }, "Spoken briefings")} />
          <Field label="Penny's tone">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Penny's tone">
              {(["gentle", "direct", "encouraging"] as const).map((t) => (
                <button key={t} role="radio" aria-checked={p.tone === t} onClick={() => save({ tone: t }, "Tone")}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium capitalize ring-1 ${p.tone === t ? "bg-brand-700 text-white ring-brand-700" : "bg-white ring-line hover:bg-lav-50"}`}>{t}</button>
              ))}
            </div>
          </Field>
          <Field label="Language">
            <select value={p.language} onChange={(e) => save({ language: e.target.value }, "Language")}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm">
              {LANGS.map((l) => <option key={l.code} value={l.code} disabled={!l.ready}>{l.name}{l.ready ? "" : " — planned, not yet tested"}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted">Only English is tested end-to-end today. Other languages are planned and not switched on until tested with Penny's voice.</p>
          </Field>
        </Group>

        <Group title="Forecast & notifications">
          <Field label="My safety buffer">
            <form className="flex gap-2" onSubmit={(e) => {
              e.preventDefault(); const m = poundsToMinor(buffer ?? ""); if (m === null) { setErr("Enter a buffer like 50"); return; }
              void save({ safety_buffer_minor: m }, "Safety buffer"); setBuffer(null);
            }}>
              <input aria-label="Safety buffer in pounds" value={buffer ?? String(p.safety_buffer_minor / 100)} onChange={(e) => setBuffer(e.target.value)}
                inputMode="decimal" className="w-28 rounded-lg border border-line px-3 py-2 text-sm" />
              <button className="rounded-lg bg-lav-100 px-3 text-sm font-semibold text-brand-800 hover:bg-lav-200">Save</button>
            </form>
            <p className="mt-1 text-xs text-muted">Bridge shows amber if your lowest projected balance falls below {money(p.safety_buffer_minor)}.</p>
          </Field>
          <Toggle label="In-app alerts" checked={p.notifications_enabled} onChange={(v) => save({ notifications_enabled: v }, "Alerts")}
            hint="Alerts appear in Bridge. No emails or texts are sent." />
          <Field label="Automatic check-ins (n8n schedule)">
            <select value={p.scheduled_checkin} onChange={(e) => save({ scheduled_checkin: e.target.value as Preferences["scheduled_checkin"] }, "Check-ins")}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm">
              <option value="every_minute_demo">Every minute (demo)</option>
              <option value="daily">Daily</option>
              <option value="off">Off</option>
            </select>
          </Field>
          <Toggle label="Family assistance planner" checked={p.family_assistance_available}
            hint="Show an optional planner for asking family for help. Off by default — not everyone has this option."
            onChange={(v) => save({ family_assistance_available: v }, "Family planner")} />
          {p.family_assistance_available && (
            <Field label="Family's currency">
              <select value={p.family_currency} onChange={(e) => save({ family_currency: e.target.value }, "Currency")}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm">
                {["AZN", "EUR", "INR", "NGN", "PKR", "PLN", "RON", "USD"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          )}
        </Group>
      </div>

      <section className="card p-5 sm:p-6" aria-labelledby="ev-h">
        <h2 id="ev-h" className="font-display text-lg font-bold">Event history</h2>
        <p className="mt-1 text-sm text-muted">Every change to your forecast and where it came from.</p>
        {events?.events.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">Source</th><th className="py-2">Result</th></tr></thead>
              <tbody>{events.events.map((e) => (
                <tr key={e.event_id} className="border-t border-line align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted">{new Date(e.received_at).toLocaleTimeString("en-GB")}</td>
                  <td className="py-2 pr-3"><code className="text-xs">{e.event_type}</code></td>
                  <td className="py-2 pr-3 text-xs">{e.source} <ViaBadge via={e.via} /></td>
                  <td className="py-2">{e.result.summary}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-sm text-muted">No events yet.</p>}
      </section>

      <section className="card p-5 text-sm text-muted" aria-label="About this demo">
        <p><b className="text-ink">Demo mode.</b> {user.name} is a fictional person and all figures are invented. This hackathon prototype has no
          login and stores data in a local SQLite file — it is not secure banking infrastructure and must not be used with real accounts.</p>
      </section>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="card space-y-5 p-5 sm:p-6"><h2 className="font-display text-lg font-bold">{title}</h2>{children}</section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className="mb-1.5 text-sm font-semibold">{label}</p>{children}</div>;
}
function Toggle({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? "opacity-50" : ""}`}>
      <div><p className="text-sm font-semibold">{label}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
      <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand-600" : "bg-zinc-300"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
