// ArgusCX dashboard authentication: Firebase Google sign-in exchange, the
// workspace-password fallback, and profile read/write. Mongo remains the
// source of truth for company profiles (existing "users" collection, keyed
// by "sub"). Only the configured workspace admin email may authenticate —
// Firebase verifying an email does not by itself grant dashboard access.
import { SignJWT, jwtVerify, createRemoteJWKSet } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const FIREBASE_PROJECT_ID = "device-streaming-acd6bfae";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const firebaseJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function signingKey() {
  const secret = Deno.env.get("ARGUSCX_JWT_SECRET");
  if (!secret) throw new Error("ARGUSCX_JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

async function issueAppToken(sub: string, email: string, provider: string) {
  return await new SignJWT({ email, provider, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("60m")
    .sign(signingKey());
}

async function requireIdentity(request: Request): Promise<{ sub: string; email: string } | null> {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(auth.slice(7), signingKey());
    if (!payload.sub) return null;
    return { sub: payload.sub, email: String(payload.email || "") };
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function withUsersCollection<T>(fn: (col: any) => Promise<T>): Promise<T> {
  const uri = Deno.env.get("ARGUSCX_MONGO_URI");
  if (!uri) throw new Error("not_configured");
  const { MongoClient } = await import(
    "https://esm.sh/mongodb@6.10.0?target=denonext&bundle&alias=@mongodb-js/zstd:@jspm/core/nodelibs/browser/_empty,kerberos:@jspm/core/nodelibs/browser/_empty,snappy:@jspm/core/nodelibs/browser/_empty,mongodb-client-encryption:@jspm/core/nodelibs/browser/_empty,@aws-sdk/credential-providers:@jspm/core/nodelibs/browser/_empty"
  );
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 8000,
    maxPoolSize: 1,
  });
  try {
    await client.connect();
    const col = client.db("arguscx_logs").collection("users");
    return await fn(col);
  } finally {
    await client.close().catch(() => undefined);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ detail: "Invalid request body" }, 400);
  }
  const action = String(payload.action || "");

  try {
    if (action === "login") {
      const adminEmail = Deno.env.get("ARGUSCX_ADMIN_EMAIL") || "";
      const adminPassword = Deno.env.get("ARGUSCX_ADMIN_PASSWORD") || "";
      const email = String(payload.email || "");
      const password = String(payload.password || "");
      if (!adminEmail || !adminPassword || !timingSafeEqual(email, adminEmail) || !timingSafeEqual(password, adminPassword)) {
        return jsonResponse({ detail: "Invalid dashboard credentials" }, 401);
      }
      const token = await issueAppToken("dashboard_admin", email, "password");
      return jsonResponse({ access_token: token, token_type: "bearer", user: { name: email, email, role: "admin" } });
    }

    if (action === "firebase") {
      const idToken = String(payload.id_token || "");
      if (!idToken) return jsonResponse({ detail: "Missing Firebase ID token" }, 400);
      let decoded;
      try {
        const { payload: verified } = await jwtVerify(idToken, firebaseJwks, {
          issuer: FIREBASE_ISSUER,
          audience: FIREBASE_PROJECT_ID,
        });
        decoded = verified;
      } catch {
        return jsonResponse({ detail: "Invalid Firebase identity" }, 401);
      }
      const email = String(decoded.email || "");
      if (!email || decoded.email_verified !== true) {
        return jsonResponse({ detail: "A verified Google email is required" }, 403);
      }
      const adminEmail = Deno.env.get("ARGUSCX_ADMIN_EMAIL") || "";
      if (!adminEmail || email.toLowerCase() !== adminEmail.toLowerCase()) {
        return jsonResponse({ detail: "This Google account is not authorized for the ArgusCX workspace." }, 403);
      }
      const token = await issueAppToken(String(decoded.sub), email, "firebase");
      return jsonResponse({ access_token: token, token_type: "bearer", user: { name: decoded.name || email, email, role: "admin" } });
    }

    if (action === "me") {
      const identity = await requireIdentity(request);
      if (!identity) return jsonResponse({ detail: "Not authenticated" }, 401);
      try {
        const profile = await withUsersCollection((col) => col.findOne({ sub: identity.sub }));
        return jsonResponse({
          sub: identity.sub,
          email: identity.email,
          onboarding_complete: Boolean(profile?.company_name),
          company_name: profile?.company_name ?? null,
          industry: profile?.industry ?? null,
          company_size: profile?.company_size ?? null,
          use_case: profile?.use_case ?? null,
        });
      } catch {
        return jsonResponse({ detail: "Database not available" }, 503);
      }
    }

    if (action === "profile") {
      const identity = await requireIdentity(request);
      if (!identity) return jsonResponse({ detail: "Not authenticated" }, 401);
      const companyName = String(payload.company_name || "").trim();
      if (!companyName) return jsonResponse({ detail: "company_name is required" }, 422);
      try {
        await withUsersCollection((col) =>
          col.updateOne(
            { sub: identity.sub },
            {
              $set: {
                sub: identity.sub,
                email: identity.email,
                company_name: companyName,
                industry: payload.industry ?? null,
                company_size: payload.company_size ?? null,
                use_case: payload.use_case ?? null,
                updated_at: new Date().toISOString(),
              },
              $setOnInsert: { created_at: new Date().toISOString() },
            },
            { upsert: true },
          )
        );
        return jsonResponse({ message: "Profile saved", company_name: companyName });
      } catch {
        return jsonResponse({ detail: "Database not available" }, 503);
      }
    }

    if (action === "logout") {
      return jsonResponse({ message: "Logged out" });
    }

    return jsonResponse({ detail: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error(JSON.stringify({ event: "arguscx_auth_error", message: error instanceof Error ? error.message : String(error) }));
    return jsonResponse({ detail: "Unexpected server error" }, 500);
  }
});
