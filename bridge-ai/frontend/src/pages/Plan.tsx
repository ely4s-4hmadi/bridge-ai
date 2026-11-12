import { useState } from "react";
import { Check, Copy, ExternalLink, FileText, Globe2, Pause, Play } from "lucide-react";
import { useBridge } from "../hooks/useBridge";
import { useSpeech } from "../hooks/useSpeech";
import { api } from "../services/api";
import { money, poundsToMinor } from "../lib/money";
import { Button, ErrorNote, Modal, RiskPill, SectionTitle } from "../components/ui";
import type { RescueAction } from "../types";

const PRIORITY: Record<RescueAction["priority"], string> = {
  urgent: "bg-bad-bg text-bad", high: "bg-warn-bg text-warn", medium: "bg-lav-100 text-brand-800", low: "bg-zinc-100 text-zinc-700",
};
const STATUS_LABEL = { not_started: "Not started", in_progress: "In progress", completed: "Completed" } as const;

export function Plan() {
  const { plan, summary, user, refresh } = useBridge();
  const [draft, setDraft] = useState<{ title: string; subject: string; body: string; note: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!plan || !summary) return null;

  async function openDraft(type: string, title: string) {
    setErr(null);
    try { const d = await api.draft(type); setDraft({ title, ...d }); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="My rescue plan" title="Steps you can take now">
        <RiskPill status={plan.risk.status} label={plan.risk.label} size="lg" />
      </SectionTitle>
      <p className="-mt-2 max-w-2xl text-sm text-muted">
        {summary.balance_at_critical_minor !== null && summary.balance_at_critical_minor < 0
          ? `Your forecast shows a possible ${money(-summary.balance_at_critical_minor)} gap before ${summary.critical_payment?.label.toLowerCase()}. `
          : "No gap is forecast right now. "}
        These are options, not instructions — you decide what to do, and Bridge never contacts anyone for you.
      </p>
      {err && <ErrorNote>{err}</ErrorNote>}

      <ol className="grid items-start gap-4 lg:grid-cols-3">
        {plan.primary.map((a, n) => (
          <li key={a.id}><ActionCard a={a} n={n + 1} onDraft={openDraft} onStatus={async (s) => { await api.setActionStatus(a.id, s); refresh(); }}
            canSpeak={user?.preferences.share_with_elevenlabs_consent ?? false} /></li>
        ))}
      </ol>
      {plan.additional.length > 0 && (
        <section aria-labelledby="more-h">
          <h2 id="more-h" className="mb-3 font-display text-lg font-bold">More things that may help</h2>
          <ul className="grid items-start gap-4 lg:grid-cols-3">
            {plan.additional.map((a) => (
              <li key={a.id}><ActionCard a={a} onDraft={openDraft} onStatus={async (s) => { await api.setActionStatus(a.id, s); refresh(); }}
                canSpeak={user?.preferences.share_with_elevenlabs_consent ?? false} /></li>
            ))}
          </ul>
        </section>
      )}

      {user?.preferences.family_assistance_available && <FamilyPlanner currency={user.preferences.family_currency} openDraft={openDraft} />}

      <p className="rounded-xl bg-lav-50 p-4 text-xs leading-relaxed text-muted">{plan.caveat} Bridge is a hackathon prototype using fictional data.</p>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.title ?? ""} wide>
        {draft && <DraftEditor subject={draft.subject} body={draft.body} note={draft.note} />}
      </Modal>
    </div>
  );
}

function ActionCard({ a, n, onDraft, onStatus, canSpeak }: {
  a: RescueAction; n?: number; onDraft: (t: string, title: string) => void; onStatus: (s: string) => void; canSpeak: boolean;
}) {
  const speech = useSpeech();
  const [textId, setTextId] = useState<string | null>(null);
  async function speak() {
    // Penny reads the card via the backend so only Bridge-generated text is voiced.
    const id = textId ?? (await api.chat("what should I do")).text_id;
    setTextId(id);
    speech.play(id);
  }
  return (
    <article className={`card flex flex-col p-5 ${a.status === "completed" ? "opacity-75" : ""}`} aria-labelledby={`act-${a.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${PRIORITY[a.priority]}`}>
          {n ? `${n} · ` : ""}{a.priority} priority
        </span>
        <label className="sr-only" htmlFor={`st-${a.id}`}>Status for {a.title}</label>
        <select id={`st-${a.id}`} value={a.status} onChange={(e) => onStatus(e.target.value)}
          className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-medium">
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <h3 id={`act-${a.id}`} className="mt-3 font-display text-lg font-bold leading-snug">{a.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed">{a.description}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div><dt className="text-xs font-semibold text-muted">Why this matters</dt><dd>{a.why}</dd></div>
        <div><dt className="text-xs font-semibold text-muted">Possible effect</dt>
          <dd className={a.impact.known ? "font-medium text-brand-900" : "text-muted"}>{a.impact.text}</dd></div>
        <div><dt className="text-xs font-semibold text-muted">Keep in mind</dt><dd className="text-muted">{a.limitations}</dd></div>
        <div><dt className="text-xs font-semibold text-muted">Next step</dt><dd>{a.next_step}</dd></div>
      </dl>
      {a.resources.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {a.resources.map((r) => (
            <li key={r.id} className="text-sm">
              {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                {r.name}<ExternalLink className="size-3" aria-hidden /><span className="sr-only">(opens in new tab)</span></a>
                : <span className="font-semibold">{r.name}</span>}
              <span className="block text-xs text-muted">{r.what}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 pt-4">
        {a.draft_type && <Button variant="secondary" onClick={() => onDraft(a.draft_type!, a.title)}><FileText className="size-4" />Draft message</Button>}
        {canSpeak && n === 1 && (
          <Button variant="ghost" onClick={speak} busy={speech.state === "loading"}>
            {speech.state === "playing" ? <Pause className="size-4" /> : <Play className="size-4" />}Hear the plan
          </Button>
        )}
      </div>
      {speech.state === "error" && <p className="mt-2 text-xs text-bad">Audio unavailable: {speech.error}</p>}
    </article>
  );
}

function DraftEditor({ subject, body, note }: { subject: string; body: string; note: string }) {
  const [s, setS] = useState(subject);
  const [b, setB] = useState(body);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(`${s}\n\n${b}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">{note}</p>
      <label className="block text-xs font-semibold text-muted">Subject
        <input value={s} onChange={(e) => setS(e.target.value)} className="mt-1 w-full rounded-lg border border-line font-normal px-3 py-2 text-sm text-ink" /></label>
      <label className="block text-xs font-semibold text-muted">Message (edit anything in [brackets])
        <textarea value={b} onChange={(e) => setB(e.target.value)} rows={10}
          className="mt-1 w-full rounded-lg border border-line font-normal px-3 py-2 text-sm leading-relaxed text-ink" /></label>
      <div className="flex justify-end"><Button onClick={copy}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy message"}</Button></div>
    </div>
  );
}

function FamilyPlanner({ currency, openDraft }: { currency: string; openDraft: (t: string, title: string) => void }) {
  const [amount, setAmount] = useState("85");
  const [rate, setRate] = useState("");
  const [fee, setFee] = useState("0");
  const [res, setRes] = useState<{ sender_cost: string; total_gbp: string; rate_source: string; calculated_at: string; caveat: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="fam-h">
      <h2 id="fam-h" className="flex items-center gap-2 font-display text-lg font-bold"><Globe2 className="size-5 text-brand-600" />Family assistance planner</h2>
      <p className="mt-1 text-sm text-muted">Optional. Only if family support is available to you — many students don't have this, and that's okay.
        No live exchange-rate source is connected, so enter an illustrative rate yourself.</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={async (e) => {
        e.preventDefault(); setErr(null);
        const a = poundsToMinor(amount), f = poundsToMinor(fee);
        if (!a || f === null || !/^\d+(\.\d+)?$/.test(rate)) { setErr("Enter an amount, a fee (0 if none) and a rate like 2.15"); return; }
        try { setRes(await api.familyEstimate({ amount_minor: a, rate, currency, fee_minor: f })); } catch (x) { setErr((x as Error).message); }
      }}>
        <label className="text-xs font-semibold text-muted">Amount needed (£)<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-lg border border-line font-normal px-3 py-2 text-sm text-ink" /></label>
        <label className="text-xs font-semibold text-muted">Transfer fee (£)<input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-lg border border-line font-normal px-3 py-2 text-sm text-ink" /></label>
        <label className="text-xs font-semibold text-muted">Rate: 1 GBP = ? {currency}<input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="illustrative" inputMode="decimal" className="mt-1 w-full rounded-lg border border-line font-normal px-3 py-2 text-sm text-ink" /></label>
        <Button type="submit">Estimate</Button>
      </form>
      {err && <p className="mt-2 text-xs text-bad" role="alert">{err}</p>}
      {res && (
        <div className="rise mt-4 rounded-xl bg-lav-50 p-4 text-sm">
          <p>Total to cover {res.total_gbp} ≈ <b className="tabular">{res.sender_cost}</b> for the sender.</p>
          <p className="mt-1 text-xs text-muted">{res.rate_source} · {new Date(res.calculated_at).toLocaleString("en-GB")}. {res.caveat}</p>
        </div>
      )}
      <Button variant="secondary" className="mt-4" onClick={() => openDraft("family", "Message to family")}><FileText className="size-4" />Draft a message to family</Button>
    </section>
  );
}
