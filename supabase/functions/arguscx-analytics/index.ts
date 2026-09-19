// ArgusCX analytics summary: live counts computed from the tickets
// collection. Returns honest zeros when no tickets have been ingested yet —
// the ticket-intake pipeline (tickets.py) has not been ported in this pass.
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

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const identity = await requireIdentity(request);
  if (!identity) return jsonResponse({ detail: "Not authenticated" }, 401);

  const uri = Deno.env.get("ARGUSCX_MONGO_URI");
  if (!uri) {
    return jsonResponse({ total_tickets: 0, auto_resolved: 0, escalated: 0, fraud_flagged: 0 });
  }

  try {
    const { MongoClient } = await import(
      "https://esm.sh/mongodb@6.10.0?target=denonext&bundle&alias=@mongodb-js/zstd:@jspm/core/nodelibs/browser/_empty,kerberos:@jspm/core/nodelibs/browser/_empty,snappy:@jspm/core/nodelibs/browser/_empty,mongodb-client-encryption:@jspm/core/nodelibs/browser/_empty,@aws-sdk/credential-providers:@jspm/core/nodelibs/browser/_empty"
    );
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 8000, maxPoolSize: 1 });
    try {
      await client.connect();
      const tickets = client.db("arguscx_logs").collection("tickets");
      const [total, autoResolved, escalated, fraudFlagged] = await Promise.all([
        tickets.countDocuments({}),
        tickets.countDocuments({ status: "AUTO_RESOLVED" }),
        tickets.countDocuments({ status: "ESCALATED" }),
        tickets.countDocuments({ status: "FRAUD_FLAGGED" }),
      ]);
      return jsonResponse({ total_tickets: total, auto_resolved: autoResolved, escalated, fraud_flagged: fraudFlagged });
    } finally {
      await client.close().catch(() => undefined);
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "arguscx_analytics_error", message: error instanceof Error ? error.message : String(error) }));
    return jsonResponse({ detail: "Analytics database unavailable" }, 503);
  }
});
