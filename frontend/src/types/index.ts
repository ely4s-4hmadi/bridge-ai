export type RiskStatus = "green" | "amber" | "red";

export interface Risk {
  status: RiskStatus;
  label: string;
  reasons: string[];
  rules_triggered: string[];
  safety_buffer_minor: number;
  explanation: string;
  rules: Record<RiskStatus, string>;
}

export interface CriticalPayment { id: string; label: string; date: string; amount_minor: number; category: string }

export interface Summary {
  user: { id: string; name: string };
  currency: string;
  reference_date: string;
  balance_as_of: string;
  current_balance_minor: number;
  confirmed_income_minor: number;
  expected_unconfirmed_income_minor: number;
  expected_income_minor: number;
  essential_payments_minor: number;
  projected_end_minor: number;
  balance_at_critical_minor: number | null;
  downside_balance_at_critical_minor: number | null;
  critical_payment: CriticalPayment | null;
  next_payday: { date: string; label: string; amount_minor: number } | null;
  first_negative_date: string | null;
  min_balance_minor: number;
  min_balance_date: string;
  risk: Risk;
  data_note: string;
}

export interface ForecastItem {
  id: string; label: string; category: string; direction: "income" | "expense";
  amount_minor: number; status: string; essential: boolean; source: string;
}
export interface ForecastDay {
  date: string; opening_minor: number; income_minor: number; outgoing_minor: number; closing_minor: number;
  items: ForecastItem[];
}
export interface Forecast {
  scenario: string; reference_date: string; horizon_end: string; opening_minor: number; days: ForecastDay[];
  closing_minor: number; min_balance_minor: number; min_balance_date: string; first_negative_date: string | null;
  critical_payment: CriticalPayment | null; balance_at_critical_minor: number | null;
  uncovered_essentials: { id: string; label: string; date: string; amount_minor: number; shortfall_minor: number }[];
  total_income_minor: number; total_outgoing_minor: number;
}
export interface ForecastResponse { baseline: Forecast; downside: Forecast; risk: Risk; data_note: string }

export interface Scenario {
  type: "extra_expense" | "extra_income" | "remove_shift" | "reduce_income" | "bill_change" | "delay_income" | "change_payment_date";
  amount_minor?: number; date?: string; item_id?: string; days?: number; label?: string;
}
export interface SimulationResult {
  change: string; original: Forecast; updated: Forecast;
  original_balance_at_critical_minor: number | null; updated_balance_at_critical_minor: number | null;
  difference_minor: number; first_shortfall_date: string | null; timing_warning: string | null;
  explanation: string; text_id: string;
}

export interface Resource { id: string; name: string; url: string | null; what: string }
export interface RescueAction {
  id: string; category: string; priority: "urgent" | "high" | "medium" | "low"; title: string;
  description: string; why: string; triggering_event: string | null; relevant_date: string | null;
  impact: { known: boolean; conditional?: boolean; text: string }; limitations: string; next_step: string;
  draft_type: string | null; resources: Resource[]; status: "not_started" | "in_progress" | "completed";
}
export interface RescuePlan { risk: Risk; primary: RescueAction[]; additional: RescueAction[]; caveat: string }

export interface BridgeEvent {
  event_id: string; event_type: string; source: string; via: string; received_at: string; status: string;
  payload: Record<string, unknown>; result: { summary?: string; change_minor?: number; status?: string };
}
export interface MonitoringRun { id: number; ran_at: string; via: string; result: Record<string, unknown> }
export interface DemoEvents { events: BridgeEvent[]; pending: Record<string, unknown>[]; runs: MonitoringRun[] }

export type ConnStatus = "connected" | "not_connected" | "demo_simulation" | "unavailable" | "configured_untested";
export interface Integration { id: string; name: string; status: ConnStatus; detail: string }

export interface Preferences {
  tone: "gentle" | "direct" | "encouraging"; language: string; voice_briefings_opt_in: boolean;
  notifications_enabled: boolean; notification_channel: string;
  scheduled_checkin: "off" | "daily" | "every_minute_demo"; safety_buffer_minor: number;
  family_assistance_available: boolean; family_currency: string; family_language: string;
  share_with_elevenlabs_consent: boolean;
}
export interface UserProfile {
  id: string; name: string; age: number; location: string; occupation: string; reference_date: string;
  opening_balance_minor: number; balance_as_of: string; preferences: Preferences; fictional: boolean;
}
export interface Alert { id: number; level: string; title: string; body: string; created_at: string; read: boolean; via: string }

export interface ChatReply { intent: string; reply: string; text_id: string; engine: string;
  data: { original: number | null; updated: number | null } | null }
export interface Briefing { text: string; text_id: string; risk: RiskStatus }
export interface DemoResult { path: "n8n" | "local_simulation"; label: string; reason?: string;
  result: { status: string; summary?: string; message?: string } }
