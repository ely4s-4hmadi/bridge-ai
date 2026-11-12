import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, FlaskConical, Loader2, OctagonAlert, PlugZap, X } from "lucide-react";
import type { ConnStatus, RiskStatus } from "../types";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const V: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 shadow-sm",
  secondary: "bg-white text-brand-800 border border-line hover:border-lav-300 hover:bg-lav-50",
  ghost: "text-brand-700 hover:bg-lav-50",
  danger: "bg-bad text-white hover:opacity-90",
};

export function Button({ variant = "primary", busy, children, className = "", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition
        disabled:opacity-50 disabled:cursor-not-allowed ${V[variant]} ${className}`}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export const RISK_STYLE: Record<RiskStatus, { fg: string; bg: string; ring: string; Icon: typeof CheckCircle2 }> = {
  green: { fg: "text-ok", bg: "bg-ok-bg", ring: "ring-ok/25", Icon: CheckCircle2 },
  amber: { fg: "text-warn", bg: "bg-warn-bg", ring: "ring-warn/25", Icon: AlertTriangle },
  red: { fg: "text-bad", bg: "bg-bad-bg", ring: "ring-bad/25", Icon: OctagonAlert },
};

export function RiskPill({ status, label, size = "md" }: { status: RiskStatus; label: string; size?: "md" | "lg" }) {
  const s = RISK_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${s.bg} ${s.fg} font-semibold ring-1 ${s.ring}
      ${size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-xs"}`}>
      <s.Icon className={size === "lg" ? "size-4" : "size-3.5"} aria-hidden />
      {label}
    </span>
  );
}

const CONN: Record<ConnStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  connected: { label: "Connected and operating", cls: "bg-ok-bg text-ok", Icon: CheckCircle2 },
  configured_untested: { label: "Configured — not verified yet", cls: "bg-lav-100 text-brand-800", Icon: PlugZap },
  not_connected: { label: "Not connected", cls: "bg-zinc-100 text-zinc-700", Icon: CircleSlash },
  demo_simulation: { label: "Demo simulation", cls: "bg-warn-bg text-warn", Icon: FlaskConical },
  unavailable: { label: "Unavailable", cls: "bg-bad-bg text-bad", Icon: AlertTriangle },
};
export function ConnBadge({ status }: { status: ConnStatus }) {
  const c = CONN[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c.cls}`}>
      <c.Icon className="size-3.5" aria-hidden /> {c.label}
    </span>
  );
}

export function ViaBadge({ via }: { via: string }) {
  if (via === "n8n") return <span className="rounded-md bg-lav-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-800">via n8n</span>;
  if (via === "local_simulation" || via === "local")
    return <span className="rounded-md bg-warn-bg px-1.5 py-0.5 text-[11px] font-semibold text-warn">local simulation</span>;
  return <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700">{via}</span>;
}

export function Modal({ open, onClose, title, children, wide }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-2xl" : "max-w-lg"} rounded-2xl border border-line bg-white p-0
        text-ink shadow-2xl backdrop:bg-brand-950/40 backdrop:backdrop-blur-[2px]`}>
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-lav-50" aria-label="Close dialog">
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-bg px-3.5 py-2.5 text-sm text-bad">
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{children}</span>
      {onRetry && <button onClick={onRetry} className="font-semibold underline underline-offset-2">Try again</button>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}
