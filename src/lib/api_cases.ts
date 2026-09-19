import { supabase } from "@/integrations/supabase/client";
import { getToken } from "./auth";

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function invoke<T>(functionName: string, body: Record<string, unknown>, options: { redirectOnAuthError?: boolean } = {}): Promise<T> {
  const { redirectOnAuthError = true } = options;
  const token = getToken();
  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const status = context?.status;
    const detail = context ? await context.clone().json().catch(() => null) : null;
    if (status === 401 && redirectOnAuthError && typeof window !== "undefined") {
      window.localStorage.removeItem("arguscx_dashboard_token");
      window.location.href = "/login";
    }
    throw new ApiRequestError((detail && (detail as { detail?: string }).detail) || error.message || "Request failed", status);
  }
  return data as T;
}

export type VerificationSignal = { confidence?: number; findings?: string };

export type VerificationCase = {
  id: string;
  session_id: string;
  state: string;
  routing?: string;
  risk_score?: number;
  signals?: Record<string, VerificationSignal>;
  reasoning_narrative?: string;
  created_at: string;
  order_id?: string;
  customer_ref?: string;
  category?: string;
  assurance_level?: string;
};

export type CasesResponse = { total: number; cases: VerificationCase[]; limit: number; offset: number };

export type VerificationSession = {
  session_id: string;
  status: string;
  order_id?: string | null;
  assurance_level: string;
  challenges_total: number;
  challenges_completed: number;
  created_at: string;
  expires_at: string;
  completed_at?: string | null;
};

export type SessionsResponse = { total: number; sessions: VerificationSession[]; limit: number; offset: number };

export type AnalyticsSummary = {
  total_tickets: number;
  auto_resolved: number;
  escalated: number;
  fraud_flagged: number;
  avg_confidence_score: number;
  resolution_rate: number;
  fraud_detection_rate: number;
  tickets_by_category: Record<string, number>;
  tickets_by_channel: Record<string, number>;
  tickets_by_status: Record<string, number>;
};

export type AnalyticsTrends = { trends: { hour: string; tickets: number }[]; period: string };
export type FraudStats = Record<string, number>;
export type ComplaintClusters = { clusters: { category: string; total: number; recent: number; spike: boolean }[]; spike_detected: boolean };

export type CompanyAnalytics = {
  company_name: string;
  user_email: string;
  plan_tier: string;
  plan_limit: number;
  plan_used: number;
  months: string[];
  monthly_volumes: number[];
  monthly_resolved: number[];
  monthly_fraud: number[];
  monthly_escalated: number[];
  kpis: {
    total_tickets: number;
    total_resolved: number;
    total_fraud: number;
    total_escalated: number;
    resolution_rate: number;
    fraud_rate: number;
    avg_confidence: number;
    avg_response_ms: number;
  };
  category_breakdown: Record<string, number>;
  channel_breakdown: Record<string, number>;
  top_issues: { category: string; count: number }[];
  recent_activity: { id: string; subject: string; status: string; confidence: number; hours_ago: number; category: string }[];
};

export function getCases() {
  return invoke<CasesResponse>("arguscx-cases", { action: "list" });
}

export function getCaseDetails(caseId: string) {
  return invoke<VerificationCase & { session?: Record<string, unknown> }>("arguscx-cases", { action: "get", case_id: caseId });
}

export function reviewCase(caseId: string, decision: "APPROVED" | "REJECTED" | "ESCALATED", notes: string) {
  return invoke<{ message: string; case_id: string; decision: string }>("arguscx-cases", { action: "review", case_id: caseId, decision, notes });
}

export const resolveCase = reviewCase;

export function getSessions(limit = 100) {
  return invoke<SessionsResponse>("arguscx-sessions", { action: "list", limit });
}

export function createSession(fields: Record<string, unknown>) {
  return invoke<{ session_id: string; capture_url: string; expires_at: string; challenge_count: number }>(
    "arguscx-sessions",
    { action: "create", ...fields },
  );
}

export function getAnalyticsSummary() {
  return invoke<AnalyticsSummary>("arguscx-analytics", { action: "summary" });
}

export function getAnalyticsTrends() {
  return invoke<AnalyticsTrends>("arguscx-analytics", { action: "trends" });
}

export function getFraudStats() {
  return invoke<FraudStats>("arguscx-analytics", { action: "fraud-stats" });
}

export function getComplaintClusters() {
  return invoke<ComplaintClusters>("arguscx-analytics", { action: "complaint-clusters" });
}

export function getCompanyAnalytics() {
  return invoke<CompanyAnalytics>("arguscx-analytics", { action: "company" });
}

export type PublicChallenge = { step_index: number; challenge_type: string; instruction_text: string; required_action: string };
export type PublicSessionData = { session_id: string; challenges: PublicChallenge[]; capture_url: string; expires_at: string };

export function getPublicSession(sessionId: string, sessionToken: string) {
  return invoke<PublicSessionData>("arguscx-sessions", { action: "get", session_id: sessionId, session_token: sessionToken }, { redirectOnAuthError: false });
}

export function completeSession(sessionId: string, sessionToken: string, fields: { assurance_level: string; evidence_ids: string[]; evidence_urls: string[] }) {
  return invoke<{ message: string; session_id: string; status: string }>("arguscx-sessions", { action: "complete", session_id: sessionId, session_token: sessionToken, ...fields }, { redirectOnAuthError: false });
}

export type ApiKey = {
  key_id: string;
  client_id: string;
  key_prefix: string;
  company_name: string;
  created_at: string;
  is_active: boolean;
  usage_count: number;
  rate_limit_per_minute: number;
};

export type CreatedApiKey = { api_key: string; client_id: string; key_id: string; company_name: string };

export function listApiKeys() {
  return invoke<ApiKey[]>("arguscx-api-keys", { action: "list" });
}

export function createApiKey(companyName: string, rateLimitPerMinute = 60) {
  return invoke<CreatedApiKey>("arguscx-api-keys", { action: "create", company_name: companyName, rate_limit_per_minute: rateLimitPerMinute });
}

export function revokeApiKey(keyId: string) {
  return invoke<{ message: string; key_id: string }>("arguscx-api-keys", { action: "delete", key_id: keyId });
}

// fetchApi is kept only for the shape used by legacy component code during
// migration; every call now routes through a named backend function above.
export async function fetchApi<T>(endpoint: string): Promise<T> {
  if (endpoint === "/analytics/summary") return getAnalyticsSummary() as unknown as Promise<T>;
  throw new ApiRequestError(`No backend function is wired for ${endpoint} yet.`);
}
