import { useMemo, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import { day, money } from "../lib/money";
import type { Forecast, ForecastItem } from "../types";

interface Row { date: string; label: string; balance: number; whatif?: number; minor: number; whatifMinor?: number; items: ForecastItem[] }

export function ForecastChart({ forecast, whatIf }: { forecast: Forecast; whatIf?: Forecast | null }) {
  const [asTable, setAsTable] = useState(false);
  const rows: Row[] = useMemo(() => {
    const w = new Map(whatIf?.days.map((d) => [d.date, d.closing_minor]));
    return forecast.days.map((d) => ({
      date: d.date,
      label: new Date(d.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      // Pounds are used only to position points on the chart; every figure shown in text comes from integer pence.
      balance: d.closing_minor / 100, minor: d.closing_minor,
      whatif: whatIf ? (w.get(d.date) ?? 0) / 100 : undefined, whatifMinor: w.get(d.date),
      items: d.items,
    }));
  }, [forecast, whatIf]);

  const values = rows.flatMap((r) => [r.balance, r.whatif ?? r.balance]);
  const lo = Math.min(0, ...values), hi = Math.max(...values);
  const step = hi - lo > 600 ? 200 : 100;
  const yMin = Math.floor((lo - 20) / step) * step, yMax = Math.ceil((hi + 20) / step) * step;
  const ticks = Array.from({ length: Math.round((yMax - yMin) / step) + 1 }, (_, i) => yMin + i * step);
  const crit = forecast.critical_payment;
  const critRow = crit ? rows.find((r) => r.date === crit.date) : undefined;
  const neg = forecast.first_negative_date ? rows.find((r) => r.date === forecast.first_negative_date) : undefined;
  const moneyDays = forecast.days.filter((d) => d.items.length);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5"><i className="h-2 w-5 rounded-full bg-brand-600" />Projected balance</span>
          {whatIf && <span className="inline-flex items-center gap-1.5"><i className="h-0 w-5 border-t-2 border-dashed border-warn" />What-if</span>}
          <span className="inline-flex items-center gap-1.5"><i className="h-2 w-5 rounded-sm bg-bad-bg ring-1 ring-bad/30" />Below £0</span>
        </div>
        <button onClick={() => setAsTable((v) => !v)} className="font-semibold text-brand-700 underline-offset-2 hover:underline"
          aria-pressed={asTable}>
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-80 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm tabular">
            <caption className="sr-only">Days with scheduled money in or out, and projected closing balance</caption>
            <thead className="sticky top-0 bg-lav-50 text-left text-xs text-muted">
              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">What happens</th>
                <th className="px-3 py-2 text-right">Balance after</th>{whatIf && <th className="px-3 py-2 text-right">What-if</th>}</tr>
            </thead>
            <tbody>
              {moneyDays.map((d) => {
                const w = whatIf?.days.find((x) => x.date === d.date);
                return (
                  <tr key={d.date} className="border-t border-line">
                    <td className="px-3 py-2 whitespace-nowrap">{day(d.date, true)}</td>
                    <td className="px-3 py-2">{d.items.map((i) => `${i.label} ${i.direction === "income" ? "+" : "−"}${money(i.amount_minor)}`).join(", ")}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${d.closing_minor < 0 ? "text-bad" : ""}`}>{money(d.closing_minor)}</td>
                    {whatIf && <td className={`px-3 py-2 text-right ${(w?.closing_minor ?? 0) < 0 ? "text-bad" : ""}`}>{money(w?.closing_minor)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72 w-full" role="img"
          aria-label={`Daily projected balance from ${day(forecast.reference_date)} to ${day(forecast.horizon_end)}. ` +
            (crit ? `On ${day(crit.date)}, after ${crit.label}, the balance is ${money(forecast.balance_at_critical_minor)}.` : "")}>
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6a57de" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#6a57de" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#ece9f3" vertical={false} />
              <ReferenceArea y1={yMin} y2={0} fill="#fde7e4" fillOpacity={0.7} ifOverflow="extendDomain" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5d5878" }} tickLine={false} axisLine={false}
                interval="preserveStartEnd" minTickGap={24} />
              <YAxis domain={[yMin, yMax]} ticks={ticks} tick={{ fontSize: 11, fill: "#5d5878" }}
                tickFormatter={(v: number) => (v < 0 ? `−£${Math.abs(v)}` : `£${v}`)} tickLine={false} axisLine={false} width={52} />
              <ReferenceLine y={0} stroke="#a8231a" strokeWidth={1.5} />
              {critRow && <ReferenceLine x={critRow.label} stroke="#31237a" strokeDasharray="4 4"
                label={{ value: crit!.label, position: "insideTopLeft", fill: "#31237a", fontSize: 11, fontWeight: 600 }} />}
              <Tooltip content={<Tip />} />
              <Area type="stepAfter" dataKey="balance" stroke="#4f3cc0" strokeWidth={2.5} fill="url(#bal)" isAnimationActive />
              {whatIf && <Line type="stepAfter" dataKey="whatif" stroke="#c27800" strokeWidth={2.5} strokeDasharray="6 4" dot={false} />}
              {neg && <ReferenceDot x={neg.label} y={neg.balance} r={6} fill="#a8231a" stroke="#fff" strokeWidth={2} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{day(r.date, true)}</p>
      <p className={`tabular ${r.minor < 0 ? "text-bad" : "text-ink"}`}>Balance: <b>{money(r.minor)}</b></p>
      {r.whatifMinor !== undefined && <p className="tabular text-warn">What-if: <b>{money(r.whatifMinor)}</b></p>}
      {r.items.map((i) => (
        <p key={i.id} className="text-muted">{i.label}: {i.direction === "income" ? "+" : "−"}{money(i.amount_minor)}
          {i.status === "expected" && i.direction === "income" ? " (not confirmed)" : ""}</p>
      ))}
    </div>
  );
}
