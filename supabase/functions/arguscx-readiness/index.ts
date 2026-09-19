import { MongoClient } from "https://esm.sh/gh/denodrivers/mongo@v0.32.0/mod.ts";

// Read-only compatibility probe. Never returns credentials or business records.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (!["GET", "POST"].includes(request.method)) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const uri = Deno.env.get("ARGUSCX_MONGO_URI");
  if (!uri) {
    return new Response(JSON.stringify({ ready: false, database: "not_configured" }), { status: 503, headers });
  }

  let client: MongoClient | undefined;
  try {
    client = new MongoClient();
    await client.connect(uri);
    await client.database("arguscx_logs").runCommand({ ping: 1 });
    console.info("arguscx_readiness: database connection verified; no data written");
    return new Response(JSON.stringify({ ready: true, database: "connected", writes_performed: false }), { headers });
  } catch (error: unknown) {
    // Driver error messages may contain hosts or credentials. Only log a safe category.
    const message = error instanceof Error ? error.message : "";
    const category = /authentication|auth failed|bad auth|scram/i.test(message) ? "authentication_failed"
      : /not a function|not implemented|not supported|is not defined/i.test(message) ? "unsupported_runtime"
      : /dns|srv|ENOTFOUND|no records/i.test(message) ? "dns_unavailable"
      : /certificate|tls|ssl/i.test(message) ? "tls_failed"
      : /timeout|timed out|refused|network|unreachable|permission denied/i.test(message) ? "network_unavailable"
      : /invalid.*uri|invalid.*url|connection string/i.test(message) ? "invalid_connection_string"
      : "connection_failed";
    console.error(`arguscx_readiness: ${category}`);
    return new Response(JSON.stringify({ ready: false, database: category, writes_performed: false }), { status: 503, headers });
  } finally {
    client?.close();
  }
});
