// ArgusCX verification cases: list/detail/review for the operator dashboard.
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
    return payload.sub ? { sub: String(payload.sub) } : null;
  } catch {
    return null;
  }
}

async function withCollections<T>(fn: (cases: any, sessions: any) => Promise<T>): Promise<T> {
  const uri = Deno.env.get("ARGUSCX_MONGO_URI");
  if (!uri) throw new Error("not_configured");
  const { MongoClient } = await import(
    "https://esm.sh/mongodb@6.10.0?target=denonext&bundle&alias=@mongodb-js/zstd:@jspm/core/nodelibs/browser/_empty,kerberos:@jspm/core/nodelibs/browser/_empty,snappy:@jspm/core/nodelibs/browser/_empty,mongodb-client-encryption:@jspm/core/nodelibs/browser/_empty,@aws-sdk/credential-providers:@jspm/core/nodelibs/browser/_empty"
  );
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 8000, maxPoolSize: 1 });
  try {
    await client.connect();
    const db = client.db("arguscx_logs");
    return await fn(db.collection("cases"), db.collection("sessions"));
  } finally {
    await client.close().catch(() => undefined);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const identity = await requireIdentity(request);
  if (!identity) return jsonResponse({ detail: "Not authenticated" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ detail: "Invalid request body" }, 400);
  }
  const action = String(payload.action || "");

  try {
    if (action === "list") {
      const limit = Math.min(Math.max(Number(payload.limit) || 50, 1), 200);
      const query: Record<string, unknown> = {};
      if (payload.state) query.state = String(payload.state).toUpperCase();
      const result = await withCollections(async (cases, sessions) => {
        const total = await cases.countDocuments(query);
        const page = await cases.find(query).limit(limit).toArray();
        const enriched = [];
        for (const c of page) {
          const session = (await sessions.findOne({ id: c.session_id })) || {};
          enriched.push({
            id: c.id,
            session_id: c.session_id,
            state: c.state,
            routing: c.routing,
            risk_score: c.risk_score ?? null,
            reasoning_narrative: c.reasoning_narrative ?? null,
            order_id: session.order_id ?? null,
            customer_ref: session.customer_ref ?? null,
            category: session.category ?? null,
            assurance_level: session.assurance_level ?? null,
            created_at: session.created_at ?? c.created_at,
          });
        }
        return { total, enriched };
      });
      return jsonResponse({ total: result.total, cases: result.enriched, limit, offset: 0 });
    }

    if (action === "get") {
      const caseId = String(payload.case_id || "");
      const result = await withCollections(async (cases, sessions) => {
        const c = await cases.findOne({ id: caseId });
        if (!c) return null;
        const session = (await sessions.findOne({ id: c.session_id })) || {};
        return {
          ...c,
          _id: undefined,
          session: {
            id: c.session_id,
            order_id: session.order_id ?? null,
            customer_ref: session.customer_ref ?? null,
            claim_text: session.claim_text ?? null,
            return_reason: session.return_reason ?? null,
            category: session.category ?? null,
            expected_serial: session.expected_serial ?? null,
            assurance_level: session.assurance_level ?? null,
            challenges: session.challenge_sequence ?? [],
            evidence_ids: session.evidence_ids ?? [],
            evidence_urls: session.evidence_urls ?? [],
            created_at: session.created_at ?? null,
          },
        };
      });
      if (!result) return jsonResponse({ detail: "Case not found" }, 404);
      return jsonResponse(result);
    }

    if (action === "review") {
      const caseId = String(payload.case_id || "");
      const decision = String(payload.decision || "").toUpperCase();
      if (!["APPROVED", "REJECTED", "ESCALATED"].includes(decision)) {
        return jsonResponse({ detail: "Decision must be APPROVED, REJECTED, or ESCALATED" }, 422);
      }
      const updated = await withCollections(async (cases) => {
        const existing = await cases.findOne({ id: caseId });
        if (!existing) return false;
        await cases.updateOne({ id: caseId }, {
          $set: {
            reviewer_id: identity.sub,
            reviewer_decision: decision,
            reviewer_notes: payload.notes ?? null,
            reviewed_at: new Date().toISOString(),
            state: decision,
            routing: decision,
          },
        });
        return true;
      });
      if (!updated) return jsonResponse({ detail: "Case not found" }, 404);
      return jsonResponse({ message: "Review recorded", case_id: caseId, decision });
    }

    return jsonResponse({ detail: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error(JSON.stringify({ event: "arguscx_cases_error", message: error instanceof Error ? error.message : String(error) }));
    return jsonResponse({ detail: "Unexpected server error" }, 500);
  }
});
