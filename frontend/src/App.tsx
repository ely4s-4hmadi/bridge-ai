import { useEffect, useState } from "react";
import { Bell, Home as HomeIcon, LifeBuoy, LineChart, MonitorPlay, Settings as SettingsIcon } from "lucide-react";
import { BridgeProvider, useBridge } from "./hooks/useBridge";
import { Home } from "./pages/Home";
import { Runway } from "./pages/Runway";
import { Plan } from "./pages/Plan";
import { Settings } from "./pages/Settings";
import { DemoPanel } from "./components/DemoPanel";
import { Button, ErrorNote, Modal } from "./components/ui";
import { api } from "./services/api";

export type Page = "home" | "runway" | "plan" | "settings";
const NAV: { id: Page; label: string; Icon: typeof HomeIcon }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "runway", label: "Runway", Icon: LineChart },
  { id: "plan", label: "Plan", Icon: LifeBuoy },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

export default function App() {
  return <BridgeProvider><Shell /></BridgeProvider>;
}

function readPage(): Page {
  const h = window.location.hash.replace("#/", "") as Page;
  return NAV.some((n) => n.id === h) ? h : "home";
}

function Shell() {
  const { loading, error, refresh, summary, alerts } = useBridge();
  const [page, setPage] = useState<Page>(readPage);
  const [demoOpen, setDemoOpen] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [welcome, setWelcome] = useState(() => { try { return !localStorage.getItem("bridge.welcomed"); } catch { return false; } });
  const unread = alerts.filter((a) => !a.read);

  useEffect(() => {
    const onHash = () => setPage(readPage());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (p: Page) => { window.location.hash = `#/${p}`; setPage(p); window.scrollTo({ top: 0 }); };
  useEffect(() => {
    document.title = `${NAV.find((n) => n.id === page)?.label} · Bridge AI`;
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [page]);

  return (
    <div className="min-h-dvh pb-24 md:pb-10">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <button onClick={() => go("home")} className="flex items-center gap-2.5" aria-label="Bridge AI home">
            <Logo />
            <span className="font-display text-lg font-extrabold">Bridge<span className="text-brand-600"> AI</span></span>
          </button>
          <nav aria-label="Main" className="ml-6 hidden gap-1 md:flex">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => go(n.id)} aria-current={page === n.id ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition
                  ${page === n.id ? "bg-lav-100 text-brand-900" : "text-muted hover:bg-lav-50 hover:text-ink"}`}>
                <n.Icon className="size-4" aria-hidden />{n.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full bg-warn-bg px-2.5 py-1 text-[11px] font-semibold text-warn sm:inline">Demo · fictional data</span>
            <AlertBell count={unread.length} onOpen={() => go("plan")} />
            <button onClick={() => setDemoOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-brand-800 hover:bg-lav-50">
              <MonitorPlay className="size-4" aria-hidden /><span className="hidden sm:inline">Presenter</span><span className="sr-only sm:hidden">Presenter controls</span>
            </button>
          </div>
        </div>
      </header>

      {unread[0] && page === "home" && (
        <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <div role="status" className={`rise flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${unread[0].level === "red" ? "bg-bad-bg text-bad" : "bg-warn-bg text-warn"}`}>
            <Bell className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="flex-1"><b>{unread[0].title}.</b> <span className="text-ink/80">{unread[0].body}</span></p>
            <button className="shrink-0 font-semibold underline underline-offset-2" onClick={async () => { await api.markAlert(unread[0].id, true); refresh(); }}>Dismiss</button>
          </div>
        </div>
      )}

      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pt-6 outline-none sm:px-6">
        {error && <div className="mb-4"><ErrorNote onRetry={refresh}>{error}</ErrorNote></div>}
        {loading && !summary ? <Skeleton /> : summary && (
          <>
            {page === "home" && <Home go={go} question={question} />}
            {page === "runway" && <Runway />}
            {page === "plan" && <Plan />}
            {page === "settings" && <Settings />}
          </>
        )}
        <footer className="mt-12 border-t border-line pt-5 text-xs text-muted">
          Bridge AI · Team QuadCore · GreatUniHack 2026. Not affiliated with any bank. General information only, not regulated financial advice.
        </footer>
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-white/95 backdrop-blur md:hidden">
        {NAV.map((n) => (
          <button key={n.id} onClick={() => go(n.id)} aria-current={page === n.id ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${page === n.id ? "text-brand-700" : "text-muted"}`}>
            <n.Icon className="size-5" aria-hidden />{n.label}
          </button>
        ))}
      </nav>

      <DemoPanel open={demoOpen} onClose={() => setDemoOpen(false)} go={go} ask={(q) => setQuestion(q + " ".repeat(Math.floor(Math.random() * 3)))} />

      <Modal open={welcome} onClose={() => { try { localStorage.setItem("bridge.welcomed", "1"); } catch { /* ignore */ } setWelcome(false); }} title="Welcome to Bridge">
        <div className="space-y-3 text-sm leading-relaxed">
          <p><b>Financial help before financial crisis.</b> Bridge watches for changes like a cancelled shift or a bigger bill,
            forecasts what they mean for your essential payments, and helps you plan — before money runs short.</p>
          <ul className="space-y-1.5 text-muted">
            <li><b className="text-ink">Detect</b> — n8n brings in changes from your shifts and bills.</li>
            <li><b className="text-ink">Predict</b> — Runway calculates your day-by-day balance.</li>
            <li><b className="text-ink">Help</b> — Penny explains it in plain words, and you decide what to do.</li>
          </ul>
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">This demo uses a fictional person, Amira. No real bank is connected.</p>
        </div>
        <div className="mt-5 flex justify-end"><Button onClick={() => { try { localStorage.setItem("bridge.welcomed", "1"); } catch { /* ignore */ } setWelcome(false); }}>Get started</Button></div>
      </Modal>
    </div>
  );
}

function AlertBell({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="relative rounded-xl p-2 text-muted hover:bg-lav-50" aria-label={`${count} unread alert${count === 1 ? "" : "s"} — open rescue plan`}>
      <Bell className="size-5" />
      {count > 0 && <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-bad text-[10px] font-bold text-white">{count}</span>}
    </button>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#31237a" />
      <path d="M6 21c3-7 7-10 10-10s7 3 10 10" fill="none" stroke="#ece7ff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10 21v-4M16 21v-6M22 21v-4" stroke="#b9a8ff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your forecast">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-lav-100" />
      <div className="h-56 animate-pulse rounded-3xl bg-lav-50" />
      <div className="grid gap-4 md:grid-cols-2"><div className="h-64 animate-pulse rounded-3xl bg-lav-50" /><div className="h-64 animate-pulse rounded-3xl bg-lav-50" /></div>
    </div>
  );
}
