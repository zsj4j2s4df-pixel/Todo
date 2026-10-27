export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const endpoints = {
      "/mcp": "mcp",
      "/.well-known/oauth-protected-resource": "resource",
      "/.well-known/oauth-protected-resource/mcp": "resource",
      "/.well-known/oauth-authorization-server": "metadata",
      "/.well-known/oauth-authorization-server/mcp-auth": "metadata",
      "/mcp-auth/register": "register",
      "/mcp-auth/authorize": "authorize",
      "/mcp-auth/token": "token",
      "/mcp-auth/revoke": "revoke",
    };
    if (Object.hasOwn(endpoints, incoming.pathname)) {
      if (!["GET", "POST", "OPTIONS"].includes(request.method))
        return new Response("Method not allowed", {
          status: 405,
          headers: { Allow: "GET,POST,OPTIONS", "Cache-Control": "no-store" },
        });
      if (Number(request.headers.get("content-length") || 0) > 40000)
        return new Response("Request too large", { status: 413 });
      const target = new URL(
        `https://pyqvxwxpsngbndkrlajz.supabase.co/functions/v1/todo-mcp/${endpoints[incoming.pathname]}`,
      );
      target.search = incoming.search;
      const headers = new Headers();
      for (const name of [
        "authorization",
        "content-type",
        "accept",
        "origin",
        "mcp-protocol-version",
      ]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      try {
        // Fixed upstream only; stream request/response bodies. No secrets or cookies are added.
        return await fetch(target, {
          method: request.method,
          headers,
          body: request.method === "POST" ? request.body : null,
          redirect: "manual",
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        return Response.json(
          { error: "Todo connector tijdelijk niet bereikbaar" },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    return env.ASSETS.fetch(request);
  },
};
