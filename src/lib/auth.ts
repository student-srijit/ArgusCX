import { supabase } from "@/integrations/supabase/client";

const TOKEN_KEY = "arguscx_dashboard_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

type AuthUser = { name: string; email: string; role: string };
type AuthResponse = { access_token: string; token_type: string; user: AuthUser };

export type MeResponse = {
  sub: string;
  email: string;
  onboarding_complete: boolean;
  company_name: string | null;
  industry: string | null;
  company_size: string | null;
  use_case: string | null;
};

async function invokeAuth<T>(action: string, body: Record<string, unknown> = {}) {
  const token = getToken();
  const { data, error } = await supabase.functions.invoke<T>("arguscx-auth", {
    body: { action, ...body },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context ? await context.clone().json().catch(() => null) : null;
    throw new Error((detail && (detail as { detail?: string }).detail) || error.message || "Request failed");
  }
  return data as T;
}

export async function loginWithPassword(email: string, password: string) {
  const result = await invokeAuth<AuthResponse>("login", { email, password });
  setToken(result.access_token);
  return result;
}

export async function loginWithFirebaseToken(idToken: string) {
  const result = await invokeAuth<AuthResponse>("firebase", { id_token: idToken });
  setToken(result.access_token);
  return result;
}

export async function fetchMe() {
  return invokeAuth<MeResponse>("me");
}

export async function saveProfile(fields: { company_name: string; industry?: string; company_size?: string; use_case?: string }) {
  return invokeAuth<{ message: string; company_name: string }>("profile", fields);
}

export async function logout() {
  try {
    await invokeAuth("logout");
  } finally {
    clearToken();
  }
}
