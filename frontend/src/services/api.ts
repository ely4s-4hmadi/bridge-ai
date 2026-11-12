import type {
  Alert, Briefing, ChatReply, DemoEvents, DemoResult, ForecastResponse, Integration, MonitoringRun,
  Preferences, RescuePlan, Scenario, SimulationResult, Summary, UserProfile,
} from "../types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...init });
  } catch {
    throw new ApiError(0, "Can't reach the Bridge server. Check that the backend is running.");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* keep */ }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}
const post = <T,>(p: string, body?: unknown) => req<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const patch = <T,>(p: string, body: unknown) => req<T>(p, { method: "PATCH", body: JSON.stringify(body) });

export const api = {
  health: () => req<{ status: string; demo_mode: boolean }>("/api/health"),
  user: () => req<UserProfile>("/api/user"),
  setPrefs: (p: Partial<Preferences>) => patch<Preferences>("/api/user/preferences", p),
  summary: () => req<Summary>("/api/finance/summary"),
  forecast: () => req<ForecastResponse>("/api/finance/forecast"),
  simulate: (s: Scenario) => post<SimulationResult>("/api/finance/simulate", s),
  plan: () => req<RescuePlan>("/api/rescue-plan"),
  setActionStatus: (id: string, status: string) => patch(`/api/rescue-plan/${id}`, { status }),
  draft: (type: string) => post<{ subject: string; body: string; note: string }>("/api/messages/draft", { type }),
  familyEstimate: (b: { amount_minor: number; rate: string; currency: string; fee_minor: number }) =>
    post<{ sender_cost: string; total_gbp: string; rate_source: string; calculated_at: string; caveat: string }>("/api/family/estimate", b),
  alerts: () => req<{ alerts: Alert[] }>("/api/alerts"),
  markAlert: (id: number, read: boolean) => patch(`/api/alerts/${id}`, { read }),
  integrations: () => req<{ integrations: Integration[]; runs: MonitoringRun[] }>("/api/integrations/status"),
  chat: (message: string) => post<ChatReply>("/api/penny/chat", { message }),
  briefing: () => post<Briefing>("/api/penny/briefing"),
  pennyStatus: () => req<{ tts_configured: boolean; agent_configured: boolean }>("/api/penny/status"),
  conversationCredentials: () => req<{ conversation_token: string }>("/api/penny/conversation-credentials"),
  tool: (name: string, parameters: Record<string, unknown>) => post<unknown>(`/api/penny/tools/${name}`, { parameters }),
  speech: async (text_id: string): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetch(BASE + "/api/penny/speech", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_id }) });
    } catch { throw new ApiError(0, "Can't reach the Bridge server."); }
    if (!res.ok) {
      let d = res.statusText; try { d = (await res.json()).detail; } catch { /* keep */ }
      throw new ApiError(res.status, d);
    }
    return res.blob();
  },
  demo: {
    reset: () => post("/api/demo/reset"),
    shift: () => post<DemoResult>("/api/demo/simulate-shift-cancellation"),
    bill: () => post<DemoResult>("/api/demo/simulate-bill-increase"),
    queue: (kind: "shift" | "bill") => post<{ queued: boolean; message: string }>("/api/demo/queue-event", { kind }),
    check: () => post<Record<string, unknown>>("/api/demo/run-monitoring-check"),
    events: () => req<DemoEvents>("/api/demo/events"),
  },
};
