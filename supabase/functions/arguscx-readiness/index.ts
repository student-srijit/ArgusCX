// This probe uses ordinary SCRAM over TLS, with no native compression,
// Kerberos, AWS authentication, or client-side field encryption. The aliases
// exclude those optional native modules; core authentication is unchanged.
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
    return new Response(JSON.stringify({ ready: false, database: "not_configured", writes_performed: false }), { status: 503, headers });
  }
  let client: { close(): Promise<void> } | undefined;
  let stage = "driver";
  try {
    const { MongoClient } = await import("https://esm.sh/mongodb@6.10.0?target=denonext&bundle&alias=@mongodb-js/zstd:@jspm/core/nodelibs/browser/_empty,kerberos:@jspm/core/nodelibs/browser/_empty,snappy:@jspm/core/nodelibs/browser/_empty,mongodb-client-encryption:@jspm/core/nodelibs/browser/_empty,@aws-sdk/credential-providers:@jspm/core/nodelibs/browser/_empty");
    stage = "configuration";
    const parsed = new URL(uri);
    const mechanism = parsed.searchParams.get("authMechanism");
    if ((mechanism && !["SCRAM-SHA-1", "SCRAM-SHA-256", "DEFAULT"].includes(mechanism)) || parsed.searchParams.get("compressors")) {
      return new Response(JSON.stringify({ ready: false, database: "unsupported_driver_option", writes_performed: false }), { status: 503, headers });
    }
    const connection = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 5000,
      maxPoolSize: 1,
      compressors: [],
      retryWrites: false,
    });
    client = connection;
    stage = "connection";
    await connection.connect();
    stage = "database_ping";
    await connection.db("arguscx_logs").command({ ping: 1 });
    return new Response(JSON.stringify({ ready: true, database: "connected", writes_performed: false }), { headers });
  } catch (error: unknown) {
    // Only return a verified numeric server code, never an error message that
    // may contain connection details. A driver failure is not a bad password.
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : null;
    const message = error instanceof Error ? error.message : "";
    const category = code === 18 ? "server_authentication_rejected"
      : code === 13 ? "server_authorization_rejected"
      : stage === "driver" || /not a function|not implemented|not supported|is not defined|Cannot read properties|kModuleError/i.test(message) ? "driver_runtime_incompatible"
      : stage === "configuration" ? "invalid_connection_configuration"
      : /dns|srv|ENOTFOUND|no records/i.test(message) ? "dns_unavailable"
      : /certificate|tls|ssl/i.test(message) ? "tls_failed"
      : /timeout|timed out|refused|network|unreachable|permission denied/i.test(message) ? "network_unavailable"
      : "connection_failed";
    // Scrub connection-string components before exposing diagnostic text.
    let diagnostic = message;
    try {
      const parsed = new URL(uri);
      const parts = [uri, parsed.username, parsed.password, parsed.hostname, parsed.pathname,
        decodeURIComponent(parsed.username), decodeURIComponent(parsed.password)]
        .filter((part) => part.length > 1).sort((a, b) => b.length - a.length);
      for (const part of parts) diagnostic = diagnostic.split(part).join("[redacted]");
      diagnostic = diagnostic.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[redacted-url]")
        .replace(/(?:[a-z0-9-]+\.)+[a-z0-9-]+(?::\d+)?/gi, "[redacted-host]").slice(0, 300);
    } catch {
      diagnostic = "Connection configuration could not be parsed";
    }
    console.error(JSON.stringify({ event: "arguscx_readiness", category, stage, code, diagnostic }));
    return new Response(JSON.stringify({ ready: false, database: category, stage, code, diagnostic, writes_performed: false }), { status: 503, headers });
  } finally {
    await client?.close().catch(() => undefined);
  }
});
