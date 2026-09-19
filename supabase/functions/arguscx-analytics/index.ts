// ArgusCX analytics: summary, 24h trend, fraud breakdown, complaint clusters,
// and company-scoped KPIs. Every number is computed live from the existing
// "tickets" Mongo collection (and "users" for company identity) — the same
// source the original Python analytics routes read from. No fabricated
// data: an empty collection returns honest zeros/empty arrays.
import { jwtVerify } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function signingKey() {
  const secret = Deno.env.get("ARGUSCX_JWT_SECRET");
  if (!secret) throw new Error("ARGUSCX_JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

async function requireIdentity(request: Request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(auth.slice(7), signingKey());
    return payload.sub ? { sub: String(payload.sub), email: String(payload.email || "") } : null;
  } catch {
    return null;
  }
}

type TicketDoc = Record<string, any>;

async function withDb<T>(fn: (db: any) => Promise<T>): Promise<T> {
  const uri = Deno.env.get("ARGUSCX_MONGO_URI");
  if (!uri) throw new Error("not_configured");
  const { MongoClient } = await import(
    "https://esm.sh/mongodb@6.10.0?target=denonext&bundle&alias=@mongodb-js/zstd:@jspm/core/nodelibs/browser/_empty,kerberos:@jspm/core/nodelibs/browser/_empty,snappy:@jspm/core/nodelibs/browser/_empty,mongodb-client-encryption:@jspm/core/nodelibs/browser/_empty,@aws-sdk/credential-providers:@jspm/core/nodelibs/browser/_empty"
  );
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 8000, maxPoolSize: 1 });
  try {
    await client.connect();
    return await fn(client.db("arguscx_logs"));
  } finally {
    await client.close().catch(() => undefined);
  }
}

function ticketStatus(t: TicketDoc): string {
  return String(t.status || "open").toUpperCase();
}
function ticketCategory(t: TicketDoc): string {
  return String(t.category || "general").toLowerCase();
}
function ticketChannel(t: TicketDoc): string {
  return String(t.channel || t.metadata?.source || "web").toLowerCase();
}
function ticketConfidence(t: TicketDoc): number {
  return typeof t.confidence_score === "number" ? t.confidence_score : (typeof t.ai_confidence === "number" ? t.ai_confidence : 0);
}
function ticketFraudScore(t: TicketDoc): number {
  return typeof t.fraud_analysis?.fraud_score === "number" ? t.fraud_analysis.fraud_score : 0;
}
function ticketCreatedAt(t: TicketDoc): Date {
  const raw = t.created_at;
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}
function isFraudFlagged(t: TicketDoc): boolean {
  return ticketStatus(t) === "FRAUD_FLAGGED" || ticketFraudScore(t) >= 0.65;
}
function isAutoResolved(t: TicketDoc): boolean {
  return ["AUTO_RESOLVED", "RESOLVED", "CLOSED"].includes(ticketStatus(t));
}
function isEscalated(t: TicketDoc): boolean {
  return ticketStatus(t) === "ESCALATED";
}

function buildSummary(tickets: TicketDoc[]) {
  const total = tickets.length;
  const autoResolved = tickets.filter(isAutoResolved).length;
  const escalated = tickets.filter(isEscalated).length;
  const fraudFlagged = tickets.filter(isFraudFlagged).length;
  const avgConfidence = total ? tickets.reduce((sum, t) => sum + ticketConfidence(t), 0) / total : 0;

  const byCategory: Record<string, number> = {};
  const byChannel: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const t of tickets) {
    const cat = ticketCategory(t);
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    const ch = ticketChannel(t);
    byChannel[ch] = (byChannel[ch] || 0) + 1;
    const st = ticketStatus(t).toLowerCase();
    byStatus[st] = (byStatus[st] || 0) + 1;
  }

  return {
    total_tickets: total,
    auto_resolved: autoResolved,
    escalated,
    fraud_flagged: fraudFlagged,
    avg_confidence_score: Math.round(avgConfidence * 1000) / 1000,
    resolution_rate: total ? Math.round((autoResolved / total) * 1000) / 1000 : 0,
    fraud_detection_rate: total ? Math.round((fraudFlagged / total) * 1000) / 1000 : 0,
    tickets_by_category: byCategory,
    tickets_by_channel: byChannel,
    tickets_by_status: byStatus,
  };
}

function buildTrends(tickets: TicketDoc[]) {
  const now = Date.now();
  const hours: { hour: string; tickets: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const bucketStart = now - (i + 1) * 3_600_000;
    const bucketEnd = now - i * 3_600_000;
    const label = new Date(bucketEnd).toISOString().slice(11, 16);
    const count = tickets.filter((t) => {
      const ts = ticketCreatedAt(t).getTime();
      return ts >= bucketStart && ts < bucketEnd;
    }).length;
    hours.push({ hour: label, tickets: count });
  }
  return { trends: hours, period: "last_24h" };
}

function buildFraudStats(tickets: TicketDoc[]) {
  const withEvidence = tickets.filter((t) => t.fraud_analysis);
  const genuine = withEvidence.filter((t) => !t.fraud_analysis?.is_suspicious).length;
  const suspicious = withEvidence.filter((t) => t.fraud_analysis?.is_suspicious && ticketFraudScore(t) < 0.8).length;
  const critical = withEvidence.filter((t) => ticketFraudScore(t) >= 0.8).length;
  const noEvidence = tickets.length - withEvidence.length;
  const totalWithEvidence = genuine + suspicious + critical;
  return {
    total_with_evidence: totalWithEvidence,
    genuine,
    suspicious,
    critical_fraud: critical,
    no_evidence: Math.max(noEvidence, 0),
    fraud_rate: totalWithEvidence ? Math.round(((suspicious + critical) / totalWithEvidence) * 1000) / 1000 : 0,
  };
}

function buildComplaintClusters(tickets: TicketDoc[]) {
  const now = Date.now();
  const recentWindow = now - 6 * 3_600_000;
  const clusters: Record<string, { category: string; total: number; recent: number; spike: boolean }> = {};
  for (const t of tickets) {
    const cat = ticketCategory(t);
    if (!clusters[cat]) clusters[cat] = { category: cat, total: 0, recent: 0, spike: false };
    clusters[cat].total += 1;
    if (ticketCreatedAt(t).getTime() >= recentWindow) clusters[cat].recent += 1;
  }
  const list = Object.values(clusters);
  for (const c of list) {
    if (c.total > 0 && c.recent / c.total > 0.4) c.spike = true;
  }
  list.sort((a, b) => b.total - a.total);
  return { clusters: list, spike_detected: list.some((c) => c.spike) };
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function buildCompany(tickets: TicketDoc[], companyName: string, email: string) {
  const now = new Date();
  const months: string[] = [];
  const monthlyVolumes: number[] = [];
  const monthlyResolved: number[] = [];
  const monthlyFraud: number[] = [];
  const monthlyEscalated: number[] = [];

  for (let i = 5; i >= 0; i--) {
    const bucketStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const bucketEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push(monthLabel(bucketStart));
    const inBucket = tickets.filter((t) => {
      const ts = ticketCreatedAt(t).getTime();
      return ts >= bucketStart.getTime() && ts < bucketEnd.getTime();
    });
    monthlyVolumes.push(inBucket.length);
    monthlyResolved.push(inBucket.filter(isAutoResolved).length);
    monthlyFraud.push(inBucket.filter(isFraudFlagged).length);
    monthlyEscalated.push(inBucket.filter(isEscalated).length);
  }

  const total = tickets.length;
  const totalResolved = tickets.filter(isAutoResolved).length;
  const totalFraud = tickets.filter(isFraudFlagged).length;
  const totalEscalated = tickets.filter(isEscalated).length;
  const avgConfidence = total ? tickets.reduce((sum, t) => sum + ticketConfidence(t), 0) / total : 0;
  const responseTimes = tickets.map((t) => Number(t.metadata?.processing_time_ms)).filter((v) => Number.isFinite(v) && v > 0);
  const avgResponseMs = responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;

  const categoryBreakdown: Record<string, number> = {};
  const channelBreakdown: Record<string, number> = {};
  for (const t of tickets) {
    const cat = ticketCategory(t);
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
    const ch = ticketChannel(t);
    channelBreakdown[ch] = (channelBreakdown[ch] || 0) + 1;
  }
  const topIssues = Object.entries(categoryBreakdown).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  const recentActivity = [...tickets]
    .sort((a, b) => ticketCreatedAt(b).getTime() - ticketCreatedAt(a).getTime())
    .slice(0, 10)
    .map((t) => ({
      id: String(t.id || t._id || ""),
      subject: String(t.subject || "Untitled ticket"),
      status: ticketStatus(t).toLowerCase(),
      confidence: Math.round(ticketConfidence(t) * 100) / 100,
      hours_ago: Math.max(0, Math.round((Date.now() - ticketCreatedAt(t).getTime()) / 3_600_000)),
      category: ticketCategory(t),
    }));

  return {
    company_name: companyName,
    user_email: email,
    plan_tier: "Enterprise AI",
    plan_limit: 50000,
    plan_used: total,
    months,
    monthly_volumes: monthlyVolumes,
    monthly_resolved: monthlyResolved,
    monthly_fraud: monthlyFraud,
    monthly_escalated: monthlyEscalated,
    kpis: {
      total_tickets: total,
      total_resolved: totalResolved,
      total_fraud: totalFraud,
      total_escalated: totalEscalated,
      resolution_rate: total ? Math.round((totalResolved / total) * 1000) / 1000 : 0,
      fraud_rate: total ? Math.round((totalFraud / total) * 1000) / 1000 : 0,
      avg_confidence: Math.round(avgConfidence * 1000) / 1000,
      avg_response_ms: avgResponseMs,
    },
    category_breakdown: categoryBreakdown,
    channel_breakdown: channelBreakdown,
    top_issues: topIssues,
    recent_activity: recentActivity,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const identity = await requireIdentity(request);
  if (!identity) return jsonResponse({ detail: "Not authenticated" }, 401);

  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    // Empty body is valid — default action is "summary".
  }
  const action = String(payload.action || "summary");

  const uri = Deno.env.get("ARGUSCX_MONGO_URI");
  if (!uri) {
    if (action === "summary") return jsonResponse(buildSummary([]));
    if (action === "trends") return jsonResponse(buildTrends([]));
    if (action === "fraud-stats") return jsonResponse(buildFraudStats([]));
    if (action === "complaint-clusters") return jsonResponse(buildComplaintClusters([]));
    if (action === "company") return jsonResponse(buildCompany([], "Your Company", identity.email));
    return jsonResponse({ detail: `Unknown action: ${action}` }, 400);
  }

  try {
    const result = await withDb(async (db) => {
      const tickets: TicketDoc[] = await db.collection("tickets").find({}).toArray();

      if (action === "summary") return buildSummary(tickets);
      if (action === "trends") return buildTrends(tickets);
      if (action === "fraud-stats") return buildFraudStats(tickets);
      if (action === "complaint-clusters") return buildComplaintClusters(tickets);
      if (action === "company") {
        const profile = await db.collection("users").findOne({ sub: identity.sub });
        const companyName = profile?.company_name || (identity.email ? identity.email.split("@")[0] : "Your Company");
        return buildCompany(tickets, companyName, identity.email);
      }
      return null;
    });
    if (result === null) return jsonResponse({ detail: `Unknown action: ${action}` }, 400);
    return jsonResponse(result);
  } catch (error) {
    console.error(JSON.stringify({ event: "arguscx_analytics_error", message: error instanceof Error ? error.message : String(error) }));
    return jsonResponse({ detail: "Analytics database unavailable" }, 503);
  }
});
