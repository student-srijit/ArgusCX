// ArgusCX verification sessions: creation (dashboard), the scoped customer
// capture flow (session-token authenticated, no login), and completion.
// Analysis workers (forensics, product-identity, embeddings) are not yet
// ported; every completed session is routed to human review rather than
// fabricating a pass/fail outcome — preserving the original safety rule that
// unassessed evidence is never treated as verified.
import { jwtVerify } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const CHALLENGE_POOL: Record<string, { instruction: string; action: string }> = {
  SHOW_FRONT: { instruction: "Hold the product facing the camera clearly.", action: "show_front" },
  SHOW_BACK: { instruction: "Flip the product and show us the back.", action: "show_back" },
  MOVE_LEFT: { instruction: "Slowly move the camera to the LEFT.", action: "move_left" },
  MOVE_RIGHT: { instruction: "Slowly move the camera to the RIGHT.", action: "move_right" },
  MOVE_UP: { instruction: "Slowly tilt the camera UPWARD.", action: "move_up" },
  FOCUS_SERIAL: { instruction: "Find the serial/IMEI and hold the camera over it.", action: "focus_serial" },
  SHOW_PACKAGING: { instruction: "Show the product packaging.", action: "show_packaging" },
  SHOW_DAMAGE: { instruction: "Move close to show any damage.", action: "show_damage" },
  ROTATE_PRODUCT: { instruction: "Slowly rotate the product 360 degrees.", action: "rotate_product" },
};

function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function buildChallengeSequence(nonce: string, count: number, requireSerial: boolean, requirePackaging: boolean) {
  const rand = seededRandom(nonce);
  const sequence: string[] = ["SHOW_FRONT"];
  const movementTypes = ["MOVE_LEFT", "MOVE_RIGHT", "MOVE_UP", "SHOW_BACK", "SHOW_DAMAGE", "ROTATE_PRODUCT"];
  for (let i = movementTypes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [movementTypes[i], movementTypes[j]] = [movementTypes[j], movementTypes[i]];
  }
  const middleCount = count - 1 - (requireSerial ? 1 : 0) - (requirePackaging ? 1 : 0);
  const middle = movementTypes.slice(0, Math.max(middleCount, 0));
  if (requirePackaging) middle.splice(Math.floor(rand() * (middle.length + 1)), 0, "SHOW_PACKAGING");
  sequence.push(...middle);
  if (requireSerial) sequence.push("FOCUS_SERIAL");
  return sequence.slice(0, count).map((type, index) => ({
    step_index: index,
    challenge_type: type,
    instruction_text: CHALLENGE_POOL[type].instruction,
    required_action: CHALLENGE_POOL[type].action,
  }));
}

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

async function withCollections<T>(fn: (sessions: any, cases: any) => Promise<T>): Promise<T> {
  const uri = Deno.env.get("ARGUSCX_MONGO_URI");
  if (!uri) throw new Error("not_configured");
  const { MongoClient } = await import(
    "https://esm.sh/mongodb@6.10.0?target=denonext&bundle&alias=@mongodb-js/zstd:@jspm/core/nodelibs/browser/_empty,kerberos:@jspm/core/nodelibs/browser/_empty,snappy:@jspm/core/nodelibs/browser/_empty,mongodb-client-encryption:@jspm/core/nodelibs/browser/_empty,@aws-sdk/credential-providers:@jspm/core/nodelibs/browser/_empty"
  );
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 8000, maxPoolSize: 1 });
  try {
    await client.connect();
    const db = client.db("arguscx_logs");
    return await fn(db.collection("sessions"), db.collection("cases"));
  } finally {
    await client.close().catch(() => undefined);
  }
}

function randomHex(bytes: number) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

const SESSION_TTL_MINUTES = 30;

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
    if (action === "create") {
      const identity = await requireIdentity(request);
      if (!identity) return jsonResponse({ detail: "An authenticated dashboard identity is required." }, 401);

      const nonce = randomHex(32);
      const sessionId = `ses_${randomHex(10)}`;
      const sessionToken = `ses_tok_${randomHex(24)}`;
      const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60_000).toISOString();
      const challengeCount = Math.min(Math.max(Number(payload.challenge_count) || 5, 3), 10);
      const requireSerial = payload.require_serial_challenge !== false;
      const requirePackaging = Boolean(payload.require_packaging_challenge);
      const challenges = buildChallengeSequence(nonce, challengeCount, requireSerial, requirePackaging);

      const origin = request.headers.get("origin") || new URL(request.url).origin;
      const captureUrl = `${origin}/verify/${sessionId}?token=${sessionToken}`;

      const session = {
        id: sessionId,
        order_id: payload.order_id ?? null,
        customer_ref: payload.customer_ref ?? null,
        sku: payload.sku ?? null,
        category: payload.category ?? null,
        expected_serial: payload.expected_serial ?? null,
        claim_text: payload.claim_text ?? null,
        return_reason: payload.return_reason ?? null,
        status: "pending",
        assurance_level: "unknown",
        nonce,
        session_token: sessionToken,
        challenge_sequence: challenges,
        challenges_completed: 0,
        evidence_ids: [] as string[],
        evidence_urls: [] as string[],
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        completed_at: null,
        tenant_id: identity.sub,
      };

      await withCollections((sessions) => sessions.insertOne(session));

      return jsonResponse({
        session_id: sessionId,
        capture_url: captureUrl,
        session_token: sessionToken,
        expires_at: expiresAt,
        challenge_count: challenges.length,
        challenges,
        status: "pending",
      }, 201);
    }

    if (action === "list") {
      const identity = await requireIdentity(request);
      if (!identity) return jsonResponse({ detail: "Not authenticated" }, 401);
      const limit = Math.min(Math.max(Number(payload.limit) || 100, 1), 200);
      const result = await withCollections(async (sessions) => {
        const total = await sessions.countDocuments({});
        const page = await sessions.find({}).sort({ created_at: -1 }).limit(limit).toArray();
        return { total, page };
      });
      return jsonResponse({
        total: result.total,
        sessions: result.page.map((s: any) => ({
          session_id: s.id,
          status: s.status,
          order_id: s.order_id ?? null,
          assurance_level: s.assurance_level,
          challenges_total: (s.challenge_sequence || []).length,
          challenges_completed: s.challenges_completed || 0,
          created_at: s.created_at,
          expires_at: s.expires_at,
          completed_at: s.completed_at ?? null,
        })),
        limit,
        offset: 0,
      });
    }

    if (action === "get") {
      const sessionId = String(payload.session_id || "");
      const token = String(payload.session_token || "");
      if (!sessionId || !token) return jsonResponse({ detail: "This verification link is incomplete." }, 400);
      const session = await withCollections((sessions) => sessions.findOne({ id: sessionId }));
      if (!session) return jsonResponse({ detail: "Session not found or this link has expired." }, 404);
      if (session.session_token !== token) return jsonResponse({ detail: "Invalid verification link." }, 403);
      if (new Date(session.expires_at).getTime() < Date.now() && session.status === "pending") {
        return jsonResponse({ detail: "This session has expired." }, 410);
      }
      return jsonResponse({
        session_id: session.id,
        challenges: session.challenge_sequence || [],
        capture_url: `${request.headers.get("origin") || ""}/verify/${session.id}?token=${token}`,
        expires_at: session.expires_at,
      });
    }

    if (action === "complete") {
      const sessionId = String(payload.session_id || "");
      const token = String(payload.session_token || "");
      if (!sessionId || !token) return jsonResponse({ detail: "This verification link is incomplete." }, 400);

      const result = await withCollections(async (sessions, cases) => {
        const session = await sessions.findOne({ id: sessionId });
        if (!session || session.session_token !== token) return { error: "not_found" as const };
        if (!["pending", "in_progress"].includes(session.status)) return { error: "already_done" as const };
        if (new Date(session.expires_at).getTime() < Date.now()) return { error: "expired" as const };

        const evidenceIds = Array.isArray(payload.evidence_ids) ? payload.evidence_ids.map(String) : [];
        const evidenceUrls = Array.isArray(payload.evidence_urls) ? payload.evidence_urls.map(String) : [];
        const completedAt = new Date().toISOString();
        await sessions.updateOne({ id: sessionId }, {
          $set: {
            status: "review_required",
            assurance_level: String(payload.assurance_level || "live_video"),
            evidence_ids: evidenceIds,
            evidence_urls: evidenceUrls,
            completed_at: completedAt,
          },
        });
        await cases.insertOne({
          id: `cas_${randomHex(8)}`,
          session_id: sessionId,
          state: "REVIEW_REQUIRED",
          routing: "REVIEW_REQUIRED",
          risk_signals_json: {},
          reasoning_narrative: evidenceIds.length
            ? "Automated forensic analysis is not yet available; operator review is required."
            : "No evidence was submitted; operator review is required.",
          claim_assertions_json: [],
          contradictions_json: [],
          created_at: completedAt,
        });
        return { error: null as const };
      });

      if (result.error === "not_found") return jsonResponse({ detail: "Session not found" }, 404);
      if (result.error === "already_done") return jsonResponse({ detail: "Session already submitted" }, 409);
      if (result.error === "expired") return jsonResponse({ detail: "Session has expired" }, 410);
      return jsonResponse({ message: "Submitted for review", session_id: sessionId, status: "review_required" });
    }

    return jsonResponse({ detail: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error(JSON.stringify({ event: "arguscx_sessions_error", message: error instanceof Error ? error.message : String(error) }));
    return jsonResponse({ detail: "Unexpected server error" }, 500);
  }
});
