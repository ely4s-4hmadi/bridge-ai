/** Format integer pence as pounds. Uses a true minus sign. Never uses floats for maths. */
export function money(minor: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (minor === null || minor === undefined) return "—";
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const pounds = Math.floor(abs / 100);
  const pence = abs % 100;
  const body = `£${pounds.toLocaleString("en-GB")}${pence ? "." + String(pence).padStart(2, "0") : ""}`;
  if (neg) return `−${body}`;
  return opts.sign && minor > 0 ? `+${body}` : body;
}

export function poundsToMinor(input: string): number | null {
  const m = input.trim().replace(/^£/, "").match(/^(\d{1,6})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

export function day(iso: string | null | undefined, withWeekday = false): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", ...(withWeekday ? { weekday: "short" } : {}) });
}

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
