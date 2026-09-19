import { supabase } from "@/integrations/supabase/client";
import { getToken } from "./auth";
import { ApiRequestError } from "./api_cases";

const EVIDENCE_BUCKET = "verification-evidence";

export type FraudRiskLevel = "low" | "medium" | "high" | "critical";

export interface FraudAnalysis {
  is_suspicious: boolean;
  fraud_risk_level: FraudRiskLevel;
  fraud_score: number;
  ai_generated_probability: number;
  exif_anomalies: string[];
  c2pa_valid: boolean | null;
  manipulation_indicators: string[];
  analysis_details: Record<string, string>;
}

export interface AgentStep {
  agent_type: string;
  status: string;
  reasoning: string | null;
  confidence: number;
  duration_ms: number | null;
}

export interface EvidenceFile {
  id: string;
  filename: string;
  url: string;
  file_type: string;
  size_bytes: number;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  channel: string;
  account_age_days: number | null;
  previous_tickets: number;
  previous_fraud_flags: number;
}

export interface Ticket {
  id: string;
  customer: Customer;
  subject: string;
  message: string;
  channel: string;
  category: string | null;
  status: string;
  evidence_files: EvidenceFile[];
  agent_steps: AgentStep[];
  confidence_score: number;
  risk_score: number;
  fraud_analysis: FraudAnalysis | null;
  resolution_message: string | null;
  case_file: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TicketResponse {
  ticket: Ticket;
  processing_time_ms: number;
  demo_mode: boolean;
}

export interface SubmitTicketPayload {
  customer_name: string;
  customer_email?: string;
  subject: string;
  message: string;
  category?: string;
  previous_fraud_flags?: number;
  previous_tickets?: number;
  evidence_files?: EvidenceFile[];
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const token = getToken();
  const { data, error } = await supabase.functions.invoke<T>("arguscx-tickets", {
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context ? await context.clone().json().catch(() => null) : null;
    throw new ApiRequestError((detail && (detail as { detail?: string }).detail) || error.message || "Request failed", context?.status);
  }
  return data as T;
}

export function submitTicket(payload: SubmitTicketPayload) {
  return invoke<TicketResponse>({ action: "submit", ...payload });
}

export function listTickets(params?: { status?: string; limit?: number }) {
  return invoke<Ticket[]>({ action: "list", ...params });
}

export function getTicket(ticketId: string) {
  return invoke<Ticket>({ action: "get", ticket_id: ticketId });
}

export function resolveTicket(ticketId: string, resolveAction: "approve" | "reject" | "modify", notes?: string, modifiedResolution?: string) {
  return invoke<{ message: string; ticket_id: string; new_status: string }>({
    action: "resolve", ticket_id: ticketId, resolve_action: resolveAction, notes, modified_resolution: modifiedResolution,
  });
}

export async function uploadEvidenceFile(file: File): Promise<EvidenceFile> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `evidence/tickets/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(EVIDENCE_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Failed to get a public URL for the uploaded evidence.");
  return { id: path, filename: file.name, url: data.publicUrl, file_type: file.type || "application/octet-stream", size_bytes: file.size };
}
