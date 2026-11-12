import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Info, Pause, Play, Wand2, X } from "lucide-react";
import { useBridge } from "../hooks/useBridge";
import { useSpeech } from "../hooks/useSpeech";
import { api } from "../services/api";
import { day, money, poundsToMinor } from "../lib/money";
import { ForecastChart } from "../components/ForecastChart";
import { Button, ErrorNote, RiskPill, SectionTitle } from "../components/ui";
import type { Scenario, SimulationResult } from "../types";

export function Runway() {
  const { summary, forecast, user } = useBridge();
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const speech = useSpeech();
  if (!summary || !forecast) return null;
  const base = forecast.baseline;
  const consent = user?.preferences.share_with_elevenlabs_consent ?? false;
  const elec = base.days.flatMap((d) => d.items).find((i) => i.category === "electricity");
  const ref = new Date(summary.reference_date + "T12:00:00");
  const weekendIso = (() => { const d = new Date(ref); const add = d.getDay() === 6 ? 1 : (6 - d.getDay() + 7) % 7; d.setDate(d.getDate() + add); return d.toISOString().slice(0, 10); })();

  const presets: { key: string; label: string; s: Scenario }[] = [
    { key: "spend30", label: "Spend £30 this weekend", s: { type: "extra_expense", amount_minor: 3000, date: weekendIso, label: "Weekend spending" } },
    { key: "extra100", label: "Extra £100 shift (paid before rent)", s: { type: "extra_income", amount_minor: 10000 } },
    { key: "lose", label: "Lose another shift", s: { type: "remove_shift", amount_minor: 9000 } },
    ...(elec ? [{ key: "elec", label: "Electricity +£20", s: { type: "bill_change", item_id: elec.id, amount_minor: 2000 } as Scenario }] : []),
    { key: "late", label: "Wages 3 days late", s: { type: "delay_income", days: 3 } },
  ];

  async function run(key: string, s: Scenario) {
    setBusy(key); setErr(null); speech.stop();
    try { setResult(await api.simulate(s)); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Runway" title="My financial future"><RiskPill status={summary.risk.status} label={summary.risk.label} size="lg" /></SectionTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Balance now" value={money(summary.current_balance_minor)} sub={`as of ${day(summary.balance_as_of)}`} />
        <Stat label="Expected incoming" value={money(summary.expected_income_minor)}
          sub={`${money(summary.confirmed_income_minor)} confirmed · ${money(summary.expected_unconfirmed_income_minor)} not yet`} />
        <Stat label="Essential payments" value={money(summary.essential_payments_minor)} sub={`next: ${summary.critical_payment?.label ?? "—"}`} />
        <Stat label={`After ${summary.critical_payment?.label.toLowerCase() ?? "bills"}`} value={money(summary.balance_at_critical_minor)}
          tone={(summary.balance_at_critical_minor ?? 0) < 0 ? "bad" : "ok"}
          sub={`Confirmed income only: ${money(summary.downside_balance_at_critical_minor)}`} />
      </div>

      <section className="card p-5 sm:p-6" aria-labelledby="chart-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="chart-h" className="font-display text-lg font-bold">Day-by-day projected balance</h2>
          <p className="text-sm text-muted">
            {base.first_negative_date ? <>First shortfall: <b className="text-bad">{day(base.first_negative_date)}</b></>
              : <>Lowest point: <b>{money(base.min_balance_minor)}</b> on {day(base.min_balance_date)}</>}
          </p>
        </div>
        <ForecastChart forecast={base} whatIf={result?.updated} />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card p-5 sm:p-6 lg:col-span-3" aria-labelledby="wi-h">
          <h2 id="wi-h" className="flex items-center gap-2 font-display text-lg font-bold"><Wand2 className="size-5 text-brand-600" />Financial time travel</h2>
          <p className="mt-1 text-sm text-muted">Try a “what if”. Your real plan never changes — this runs on a copy.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button key={p.key} variant="secondary" busy={busy === p.key} onClick={() => run(p.key, p.s)}>{p.label}</Button>
            ))}
          </div>
          <CustomScenario onRun={(s) => run("custom", s)} busy={busy === "custom"} reference={summary.reference_date} />
          {err && <div className="mt-4"><ErrorNote>{err}</ErrorNote></div>}
          {result && (
            <div className="rise mt-5 rounded-2xl border border-line bg-lav-50 p-4" aria-live="polite">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">What-if result</p>
                <button onClick={() => { setResult(null); speech.stop(); }} aria-label="Clear what-if result"
                  className="rounded-lg p-1 text-muted hover:bg-white"><X className="size-4" /></button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 tabular">
                <span className="text-lg font-semibold text-muted line-through decoration-1">{money(result.original_balance_at_critical_minor)}</span>
                <span aria-hidden>→</span>
                <span className={`font-display text-3xl font-extrabold ${(result.updated_balance_at_critical_minor ?? 0) < 0 ? "text-bad" : "text-ok"}`}>
                  {money(result.updated_balance_at_critical_minor)}</span>
                <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold
                  ${result.difference_minor < 0 ? "bg-bad-bg text-bad" : result.difference_minor > 0 ? "bg-ok-bg text-ok" : "bg-white text-muted"}`}>
                  {result.difference_minor < 0 ? <ArrowDownRight className="size-3" /> : result.difference_minor > 0 ? <ArrowUpRight className="size-3" /> : null}
                  {money(result.difference_minor, { sign: true })}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{result.explanation}</p>
              {result.timing_warning && <p className="mt-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">{result.timing_warning}</p>}
              {consent ? (
                <Button variant="ghost" className="mt-2 -ml-2" busy={speech.state === "loading"} onClick={() => speech.play(result.text_id)}>
                  {speech.state === "playing" ? <Pause className="size-4" /> : <Play className="size-4" />}
                  {speech.state === "playing" ? "Pause" : "Ask Penny to read this"}
                </Button>
              ) : <p className="mt-2 text-xs text-muted">Turn on voice consent in Settings to have Penny read this aloud.</p>}
              {speech.state === "error" && <p className="mt-1 text-xs text-bad">Audio unavailable: {speech.error}</p>}
            </div>
          )}
        </section>

        <section className="card p-5 sm:p-6 lg:col-span-2" aria-labelledby="up-h">
          <h2 id="up-h" className="font-display text-lg font-bold">Coming up</h2>
          <ol className="mt-3 divide-y divide-line">
            {base.days.filter((d) => d.items.length).flatMap((d) => d.items.map((i) => ({ ...i, date: d.date, closing: d.closing_minor })))
              .map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{i.label}</p>
                    <p className="text-xs text-muted">{day(i.date, true)}
                      {i.direction === "income" && <> · {i.status === "confirmed" ? "confirmed" : "expected, not confirmed"}</>}
                      {i.essential && " · essential"}</p>
                  </div>
                  <span className={`font-semibold tabular ${i.direction === "income" ? "text-ok" : ""}`}>
                    {i.direction === "income" ? "+" : "−"}{money(i.amount_minor)}
                  </span>
                </li>
              ))}
          </ol>
        </section>
      </div>

      <section className="card flex gap-3 p-5 text-sm leading-relaxed text-muted" aria-label="How this forecast works">
        <Info className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
        <div>
          <p><b className="text-ink">How Runway works.</b> Each day: yesterday's balance + money in − payments due. It starts from your balance
            and only uses the payments and income listed here. Income marked “not confirmed” (like a future shift) might not happen,
            so the range shows the result with confirmed income only ({money(summary.downside_balance_at_critical_minor)}) and with everything
            expected ({money(summary.balance_at_critical_minor)}).</p>
          <p className="mt-2">{summary.data_note}</p>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "ok" | "bad" }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-display text-2xl font-extrabold tabular ${tone === "bad" ? "text-bad" : ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

function CustomScenario({ onRun, busy, reference }: { onRun: (s: Scenario) => void; busy: boolean; reference: string }) {
  const [type, setType] = useState<"extra_expense" | "extra_income">("extra_expense");
  const [amount, setAmount] = useState("30");
  const [date, setDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="mt-4 grid gap-2 rounded-xl border border-dashed border-line p-3 sm:grid-cols-[1fr_7rem_10rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const minor = poundsToMinor(amount);
        if (!minor) { setErr("Enter an amount like 30 or 12.50"); return; }
        setErr(null);
        onRun({ type, amount_minor: minor, ...(date ? { date } : {}) });
      }}>
      <label className="text-xs font-medium text-muted">Your own scenario
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}
          className="mt-1 w-full rounded-lg border border-line font-normal bg-white px-2.5 py-2 text-sm text-ink">
          <option value="extra_expense">I spend money</option>
          <option value="extra_income">I receive extra money</option>
        </select>
      </label>
      <label className="text-xs font-medium text-muted">Amount (£)
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line font-normal px-2.5 py-2 text-sm text-ink" />
      </label>
      <label className="text-xs font-medium text-muted">On date (optional)
        <input type="date" value={date} min={reference} onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line font-normal px-2.5 py-2 text-sm text-ink" />
      </label>
      <Button type="submit" busy={busy}>Run</Button>
      {err && <p className="text-xs text-bad sm:col-span-4" role="alert">{err}</p>}
    </form>
  );
}
