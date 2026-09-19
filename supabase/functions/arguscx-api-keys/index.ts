// ArgusCX API key management: create/list/revoke server credentials that
// external integrations pass via X-ArgusCX-Key. Keys are stored hashed
// (SHA-256) in the existing MongoDB deployment — the plaintext key is
// returned exactly once, at creation, and never persisted.
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

async function withCollection<T>(fn: (col: any) => Promise<T>): Promise<T> {
  const uri = Deno.env.get("ARGUSCX_MONGO_URI");
  if (!uri) throw new Error("not_configured");
  const { MongoClient } = await import(
    "https://esm.sh/mongodb@6.10.0?target=denonext&bundle&alias=@mongodb-js/zstd:@jspm/core/nodelibs/browser/_empty,kerberos:@jspm/core/nodelibs/browser/_empty,snappy:@jspm/core/nodelibs/browser/_empty,mongodb-client-encryption:@jspm/core/nodelibs/browser/_empty,@aws-sdk/credential-providers:@jspm/core/nodelibs/browser/_empty"
  );
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 8000, maxPoolSize: 1 });
  try {
    await client.connect();
    return await fn(client.db("arguscx_logs").collection("api_keys"));
  } finally {
    await client.close().catch(() => undefined);
  }
}

function randomHex(bytes: number) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const identity = await requireIdentity(request);
  if (!identity) return jsonResponse({ detail: "Dashboard authentication is required" }, 403);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ detail: "Invalid request body" }, 400);
  }
  const action = String(payload.action || "");

  try {
    if (action === "create") {
      const companyName = String(payload.company_name || "").trim();
      if (!companyName) return jsonResponse({ detail: "company_name is required" }, 422);
      const rateLimit = Math.min(Math.max(Number(payload.rate_limit_per_minute) || 60, 1), 6000);
      const apiKey = `acx_live_${randomHex(24)}`;
      const keyId = `key_${randomHex(8)}`;
      const clientId = `client_${randomHex(9)}`;
      const record = {
        key_id: keyId,
        client_id: clientId,
        key_prefix: `${apiKey.slice(0, 12)}...`,
        key_hash: await sha256(apiKey),
        company_name: companyName,
        created_at: new Date().toISOString(),
        is_active: true,
        usage_count: 0,
        last_used: null as string | null,
        rate_limit_per_minute: rateLimit,
        owner_sub: identity.sub,
      };
      await withCollection((col) => col.insertOne(record));
      return jsonResponse({
        key_id: keyId,
        api_key: apiKey,
        client_id: clientId,
        company_name: companyName,
        created_at: record.created_at,
        rate_limit_per_minute: rateLimit,
        message: "Save this API key — it won't be shown again.",
      });
    }

    if (action === "list") {
      const rows = await withCollection((col) => col.find({}).sort({ created_at: -1 }).toArray());
      return jsonResponse(rows.map((r: any) => ({
        key_id: r.key_id,
        key_prefix: r.key_prefix,
        client_id: r.client_id,
        company_name: r.company_name,
        created_at: r.created_at,
        is_active: r.is_active,
        usage_count: r.usage_count ?? 0,
        last_used: r.last_used ?? null,
        rate_limit_per_minute: r.rate_limit_per_minute ?? 60,
      })));
    }

    if (action === "delete") {
      const keyId = String(payload.key_id || "");
      const updated = await withCollection(async (col) => {
        const result = await col.updateOne({ key_id: keyId }, { $set: { is_active: false, revoked_at: new Date().toISOString() } });
        return result.matchedCount > 0;
      });
      if (!updated) return jsonResponse({ detail: `API key ${keyId} not found` }, 404);
      return jsonResponse({ message: `API key ${keyId} revoked`, key_id: keyId });
    }

    return jsonResponse({ detail: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error(JSON.stringify({ event: "arguscx_api_keys_error", message: error instanceof Error ? error.message : String(error) }));
    return jsonResponse({ detail: "Unexpected server error" }, 500);
  }
});
