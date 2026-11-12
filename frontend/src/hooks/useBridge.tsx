import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../services/api";
import type { Alert, DemoEvents, ForecastResponse, Integration, RescuePlan, Summary, UserProfile } from "../types";

interface BridgeData {
  summary: Summary | null;
  forecast: ForecastResponse | null;
  plan: RescuePlan | null;
  events: DemoEvents | null;
  integrations: Integration[];
  user: UserProfile | null;
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<BridgeData | null>(null);

export function BridgeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<BridgeData, "refresh">>({
    summary: null, forecast: null, plan: null, events: null, integrations: [], user: null, alerts: [],
    loading: true, error: null, lastUpdated: null,
  });
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const [summary, forecast, plan, events, integ, user, alerts] = await Promise.all([
        api.summary(), api.forecast(), api.plan(), api.demo.events(), api.integrations(), api.user(), api.alerts(),
      ]);
      setState({ summary, forecast, plan, events, integrations: integ.integrations, user, alerts: alerts.alerts,
        loading: false, error: null, lastUpdated: new Date() });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll so changes made by the n8n scheduled workflow appear without user action.
    const t = window.setInterval(refresh, 8000);
    return () => window.clearInterval(t);
  }, [refresh]);

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

export function useBridge(): BridgeData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBridge must be used inside BridgeProvider");
  return v;
}
