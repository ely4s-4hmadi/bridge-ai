import { useState } from "react";
import { Activity, CalendarX2, Inbox, MessageCircleQuestion, RotateCcw, Wand2, Zap } from "lucide-react";
import { useBridge } from "../hooks/useBridge";
import { api } from "../services/api";
import { money, timeAgo } from "../lib/money";
import { Button, Modal, ViaBadge } from "./ui";
import type { DemoResult } from "../types";
import type { Page } from "../App";

/** Presenter-only controls. Every button triggers a real backend/n8n request; nothing here fakes UI state. */
export function DemoPanel({ open, onClose, go, ask }: { open: boolean; onClose: () => void; go: (p: Page) => void; ask: (q: string) => void }) {
  const { events, summary, integrations, refresh } = useBridge();
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<DemoResult | { label: string; path?: string; reason?: string } | null>(null);
  const n8n = integrations.find((i) => i.id === "n8n_events");

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      const r = await fn();
      if (r && typeof r === "object" && "label" in (r as object)) setLast(r as DemoResult);
      else if (r && typeof r === "object" && "message" in (r as object)) setLast({ label: String((r as { message: string }).message) });
      await refresh();
    } catch (e) { setLast({ label: `Failed: ${(e as Error).message}` }); }
    finally { setBusy(null); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Presentation mode" wide>
      <p className="-mt-2 mb-4 text-sm text-muted">
        Fictional events for the demo. n8n status: <b>{n8n ? n8n.status.replace("_", " ") : "unknown"}</b>.
        {n8n?.status !== "connected" && " If n8n can't be reached, events run as a clearly labelled local simulation."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" busy={busy === "reset"} onClick={() => act("reset", api.demo.reset)}><RotateCcw className="size-4" />Reset demo</Button>
        <Button busy={busy === "shift"} onClick={() => act("shift", api.demo.shift)}><CalendarX2 className="size-4" />Simulate cancelled shift</Button>
        <Button busy={busy === "bill"} onClick={() => act("bill", api.demo.bill)}><Zap className="size-4" />Simulate higher electricity bill</Button>
        <Button variant="secondary" onClick={() => { onClose(); go("home"); ask("Can I afford to spend £30 this weekend?"); }}>
          <MessageCircleQuestion className="size-4" />Ask Penny a question</Button>
        <Button variant="secondary" onClick={() => { onClose(); go("runway"); }}><Wand2 className="size-4" />Run a what-if scenario</Button>
        <Button variant="secondary" busy={busy === "check"} onClick={() => act("check", api.demo.check)}><Activity className="size-4" />Run risk check (local)</Button>
      </div>

      <details className="mt-4 rounded-xl border border-line p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Scheduled path: put events in the integration inbox</summary>
        <p className="mt-2 text-muted">These events wait in Bridge's inbox. The n8n scheduled workflow polls it every minute and processes them — no button press needed. Nothing happens if that workflow isn't running.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" busy={busy === "qs"} onClick={() => act("qs", () => api.demo.queue("shift"))}><Inbox className="size-4" />Queue shift cancellation</Button>
          <Button variant="secondary" busy={busy === "qb"} onClick={() => act("qb", () => api.demo.queue("bill"))}><Inbox className="size-4" />Queue bill notice</Button>
        </div>
        {!!events?.pending.length && <p className="mt-2 text-xs text-warn">{events.pending.length} event(s) waiting for n8n.</p>}
      </details>

      {last && (
        <p role="status" className={`mt-4 rounded-xl px-3.5 py-2.5 text-sm ${"path" in last && last.path === "local_simulation" ? "bg-warn-bg text-warn" : "bg-lav-50 text-brand-900"}`}>
          {last.label}{"reason" in last && last.reason ? ` — ${last.reason}` : ""}
          {"result" in last && last.result?.status === "duplicate" ? " (duplicate — already processed, nothing changed)" : ""}
        </p>
      )}

      <div className="mt-4 rounded-xl bg-surface p-3">
        <p className="text-xs font-semibold text-muted">Now: balance after rent <b className="tabular text-ink">{money(summary?.balance_at_critical_minor)}</b> · {summary?.risk.label}</p>
        <h3 className="mt-3 text-sm font-semibold">Event log</h3>
        {events?.events.length ? (
          <ul className="mt-2 space-y-1.5 text-xs">
            {events.events.map((e) => (
              <li key={e.event_id} className="flex flex-wrap items-center gap-2"><ViaBadge via={e.via} /><code>{e.event_type}</code>
                <span className="text-muted">{e.event_id} · {timeAgo(e.received_at)}</span></li>
            ))}
          </ul>
        ) : <p className="mt-1 text-xs text-muted">No events yet.</p>}
        <h3 className="mt-3 text-sm font-semibold">Monitoring runs</h3>
        {events?.runs.length ? (
          <ul className="mt-2 space-y-1 text-xs">
            {events.runs.slice(0, 5).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2"><ViaBadge via={r.via} /><span>{timeAgo(r.ran_at)}</span>
                <span className="text-muted">status {String(r.result.status)} · alert {r.result.alert_created ? "created" : "not needed (no change)"}</span></li>
            ))}
          </ul>
        ) : <p className="mt-1 text-xs text-muted">No monitoring runs yet.</p>}
      </div>
    </Modal>
  );
}
