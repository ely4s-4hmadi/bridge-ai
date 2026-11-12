import { useState } from "react";
import { ArrowRight, CalendarClock, ChevronDown, LifeBuoy, LineChart, Pause, Play, Radio, RotateCcw, Wallet } from "lucide-react";
import { useBridge } from "../hooks/useBridge";
import { useSpeech } from "../hooks/useSpeech";
import { api } from "../services/api";
import { day, money, timeAgo } from "../lib/money";
import { Penny } from "../components/Penny";
import { Button, ErrorNote, RISK_STYLE, RiskPill, ViaBadge } from "../components/ui";
import type { Briefing } from "../types";
import type { Page } from "../App";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Home({ go, question }: { go: (p: Page) => void; question?: string | null }) {
  const { summary, events, user } = useBridge();
  const [showRules, setShowRules] = useState(false);
  if (!summary) return null;
  const r = summary.risk;
  const s = RISK_STYLE[r.status];
  const crit = summary.critical_payment;
  const at = summary.balance_at_critical_minor;
  const latest = events?.events.filter((e) => e.status === "processed").slice(0, 3) ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted">{greeting()},</p>
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{summary.user.name}</h1>
      </header>

      {/* Financial safety indicator */}
      <section aria-labelledby="safety-h" className={`card relative overflow-hidden p-5 sm:p-7`}>
        <div className={`absolute inset-y-0 left-0 w-1.5 ${r.status === "red" ? "bg-bad" : r.status === "amber" ? "bg-warn" : "bg-ok"}`} aria-hidden />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="safety-h" className="text-sm font-semibold text-muted">Your money until {crit ? day(crit.date) : "the next bill"}</h2>
          <RiskPill status={r.status} label={r.label} size="lg" />
        </div>
        <p className="mt-4 font-display text-[2.6rem] leading-none font-extrabold tabular sm:text-6xl">
          <span className={at !== null && at < 0 ? "text-bad" : "text-ink"}>{money(at)}</span>
        </p>
        <p className="mt-2 text-base text-ink">
          {at !== null && at < 0
            ? <>You could be <b>{money(-at)} short</b> when {crit?.label.toLowerCase()} is due on <b>{day(crit?.date)}</b>.</>
            : <>Projected to be left after {crit?.label.toLowerCase()} on <b>{day(crit?.date)}</b>.</>}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Fact icon={<Wallet className="size-4" />} label="Balance now" value={money(summary.current_balance_minor)}
            sub={`as of ${new Date(summary.balance_as_of).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`} />
          <Fact icon={<CalendarClock className="size-4" />} label="Next payday"
            value={summary.next_payday ? money(summary.next_payday.amount_minor) : "—"} sub={summary.next_payday ? day(summary.next_payday.date, true) : "No income scheduled"} />
          <Fact icon={<CalendarClock className="size-4" />} label="Critical payment"
            value={crit ? money(crit.amount_minor) : "—"} sub={crit ? `${crit.label} · ${day(crit.date, true)}` : ""} />
        </div>
        <button onClick={() => setShowRules((v) => !v)} aria-expanded={showRules}
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
          Why {r.label.toLowerCase()}? <ChevronDown className={`size-4 transition ${showRules ? "rotate-180" : ""}`} />
        </button>
        {showRules && (
          <div className={`rise mt-3 rounded-xl ${s.bg} p-4 text-sm`}>
            <ul className="list-disc space-y-1 pl-5">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="mt-3 text-muted">{r.explanation}</p>
            <dl className="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-3">
              <div><dt className="font-semibold text-ok">Green — On track</dt><dd>{r.rules.green}</dd></div>
              <div><dt className="font-semibold text-warn">Amber — At risk</dt><dd>{r.rules.amber}</dd></div>
              <div><dt className="font-semibold text-bad">Red — Shortfall predicted</dt><dd>{r.rules.red}</dd></div>
            </dl>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => go("runway")}><LineChart className="size-4" />See my Runway</Button>
          <Button variant={r.status === "green" ? "secondary" : "primary"} onClick={() => go("plan")}>
            <LifeBuoy className="size-4" />My rescue plan<ArrowRight className="size-4" />
          </Button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3" aria-label="Penny assistant"><Penny autoQuestion={question} /></section>
        <div className="space-y-6 lg:col-span-2">
          <BriefingCard optIn={user?.preferences.voice_briefings_opt_in ?? false} consent={user?.preferences.share_with_elevenlabs_consent ?? false} />
          <section className="card p-5" aria-labelledby="changed-h">
            <h2 id="changed-h" className="flex items-center gap-2 font-display text-lg font-bold">
              <Radio className="size-4 text-brand-600" aria-hidden />What changed
            </h2>
            {latest.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No changes detected yet. Bridge is watching your shifts and bills.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {latest.map((e) => (
                  <li key={e.event_id} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <ViaBadge via={e.via} /><span>{e.source}</span><span>· {timeAgo(e.received_at)}</span>
                    </div>
                    <p className="mt-1 text-sm">{e.result.summary}</p>
                    {typeof e.result.change_minor === "number" && e.result.change_minor !== 0 && (
                      <p className="mt-0.5 text-xs font-semibold text-bad tabular">Forecast {money(e.result.change_minor, { sign: true })}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Fact({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-lav-50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">{icon}{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

function BriefingCard({ optIn, consent }: { optIn: boolean; consent: boolean }) {
  const [b, setB] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const speech = useSpeech();

  async function load() {
    setLoading(true); setErr(null);
    try { const nb = await api.briefing(); setB(nb); return nb; }
    catch (e) { setErr((e as Error).message); return null; }
    finally { setLoading(false); }
  }
  async function listen() {
    const nb = await load();
    if (nb && consent) await speech.play(nb.text_id);
  }
  const playing = speech.state === "playing";

  return (
    <section className="card p-5" aria-labelledby="brief-h">
      <h2 id="brief-h" className="font-display text-lg font-bold">Today's briefing</h2>
      <p className="mt-1 text-sm text-muted">A short spoken check-in from Penny, based on your latest forecast.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {consent && optIn ? (
          <Button onClick={() => (b && speech.activeId === b.text_id ? speech.play(b.text_id) : listen())}
            busy={loading || speech.state === "loading"}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}{playing ? "Pause" : speech.state === "paused" ? "Resume" : "Listen to briefing"}
          </Button>
        ) : (
          <Button variant="secondary" onClick={load} busy={loading}>Read briefing</Button>
        )}
        {b && <Button variant="ghost" onClick={() => { speech.stop(); void load(); }}><RotateCcw className="size-4" />Refresh</Button>}
      </div>
      {!(consent && optIn) && (
        <p className="mt-2 text-xs text-muted">Spoken briefings are off. Turn on “Spoken briefings” and voice consent in Settings to hear Penny.</p>
      )}
      {err && <div className="mt-3"><ErrorNote onRetry={load}>{err}</ErrorNote></div>}
      {speech.state === "error" && (
        <div className="mt-3"><ErrorNote onRetry={() => b && speech.play(b.text_id)}>Audio is temporarily unavailable ({speech.error}). The briefing is shown as text below.</ErrorNote></div>
      )}
      {b && <p className="rise mt-3 rounded-xl bg-lav-50 p-3.5 text-sm leading-relaxed">{b.text}</p>}
    </section>
  );
}
