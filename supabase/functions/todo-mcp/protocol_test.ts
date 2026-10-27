import { handleMcp, RESOURCE, ISSUER, validRedirect } from "./server.ts";
import { digest } from "../todo-connect/policy.ts";
const assert = (v: unknown, message = "Assertion failed") => {
  if (!v) throw Error(message);
};
const owner = "11111111-1111-4111-8111-111111111111",
  clientId = "22222222-2222-4222-8222-222222222222",
  requestId = "33333333-3333-4333-8333-333333333333";
const env = { get: (_key: string) => undefined };
const actor = (jwt: string) => ({
  auth: {
    getUser: async () =>
      jwt === "fixture-app-session"
        ? { data: { user: { id: owner, email: "fixture@example.test" } } }
        : { data: { user: null }, error: Error("Not a user JWT") },
  },
});
function admin(scopes = ["todo:read", "todo:prepare"]) {
  const calls: { op: string; p: any }[] = [];
  return {
    calls,
    rpc: async (_name: string, args: any) => {
      calls.push({ op: args.operation, p: args.p });
      switch (args.operation) {
        case "register":
          return { data: { client_id: clientId } };
        case "authorize":
          return { data: { request_id: requestId } };
        case "validate":
          return { data: { user_id: owner, scopes } };
        case "read":
          return { data: [] };
        case "consent_info":
          return {
            data: {
              id: requestId,
              client_name: "Fixture",
              scopes,
              redirect_uri: "https://client.test/callback",
            },
          };
        case "consent":
          return {
            data: {
              redirect_uri: "https://client.test/callback",
              state: "original-state",
            },
          };
        case "token":
          return { data: { scope: scopes.join(" "), expires_in: 3600 } };
        case "prepare":
          return {
            data: { proposal_id: requestId, confirmation_required: true },
          };
        default:
          return { error: { message: "invalid_request" } };
      }
    },
  };
}
function req(
  path: string,
  body?: unknown,
  token?: string,
  headers: Record<string, string> = {},
) {
  return new Request(
    "https://project.supabase.co/functions/v1/todo-mcp" + path,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    },
  );
}
Deno.test(
  "MCP metadata advertises one resource, PKCE, exact issuer and per-user scopes",
  async () => {
    const a = admin(),
      r = await handleMcp(req("/resource"), a, actor, env),
      resource = await r.json();
    assert(resource.resource === RESOURCE);
    assert(resource.authorization_servers[0] === ISSUER);
    const metadata = await (
      await handleMcp(req("/metadata"), a, actor, env)
    ).json();
    assert(metadata.code_challenge_methods_supported.join() === "S256");
    assert(!metadata.grant_types_supported.includes("password"));
    assert(a.calls.length === 0);
  },
);
Deno.test(
  "registration rejects credential-bearing and script redirect URIs before storing a client",
  async () => {
    const a = admin();
    for (const uri of [
      "javascript:alert(1)",
      "https://secret@client.test/cb",
      "https://client.test/cb#fragment",
      "http://client.test/cb",
    ]) {
      assert(!validRedirect(uri));
      const r = await handleMcp(
        req("/register", { client_name: "Fixture", redirect_uris: [uri] }),
        a,
        actor,
        env,
      );
      assert(r.status === 400);
    }
    assert(a.calls.length === 0);
    const response = await handleMcp(
      req("/register", {
        client_name: "Fixture",
        redirect_uris: ["https://client.test/cb"],
        token_endpoint_auth_method: "client_secret_post",
      }),
      a,
      actor,
      env,
    );
    const body = await response.json();
    assert(response.status === 201);
    assert(typeof body.client_secret === "string");
    assert(a.calls[0].p.secret_hash === (await digest(body.client_secret)));
    assert(!JSON.stringify(a.calls).includes(body.client_secret));
  },
);
Deno.test(
  "MCP bearer cannot approve through the app route; Supabase sessions cannot act as MCP tokens",
  async () => {
    const a = admin(),
      unauthorized = await handleMcp(
        req("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize" }),
        a,
        actor,
        env,
      );
    assert(unauthorized.status === 401);
    assert(
      unauthorized.headers
        .get("www-authenticate")
        ?.includes("resource_metadata"),
    );
    const jwt = await handleMcp(
      req(
        "/mcp",
        { jsonrpc: "2.0", id: 1, method: "initialize" },
        "a.supabase.jwt",
      ),
      a,
      actor,
      env,
    );
    assert(jwt.status === 401);
    const opaque = "A".repeat(43),
      approve = await handleMcp(
        req(
          "/",
          {
            action: "proposal_execute",
            proposal_id: requestId,
            confirmed: true,
          },
          opaque,
        ),
        a,
        actor,
        env,
      );
    assert(approve.status === 401);
    assert(!a.calls.some((c) => c.op === "proposal_execute"));
  },
);
Deno.test(
  "read-only token exposes read tools and has no model-callable confirmation tool",
  async () => {
    const a = admin(["todo:read"]),
      token = "B".repeat(43),
      r = await handleMcp(
        req("/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list" }, token),
        a,
        actor,
        env,
      ),
      body = await r.json();
    assert(body.result.tools.length > 0);
    assert(body.result.tools.every((t: any) => !t.name.startsWith("prepare_")));
    assert(!body.result.tools.some((t: any) => /confirm|execute/.test(t.name)));
    const attempt = await handleMcp(
      req(
        "/mcp",
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "confirm_item", arguments: { confirmed: true } },
        },
        token,
      ),
      a,
      actor,
      env,
    );
    assert((await attempt.json()).result.isError === true);
  },
);
Deno.test(
  "proposal creation defaults private and returns an app link instead of executing",
  async () => {
    const a = admin(),
      r = await handleMcp(
        req(
          "/mcp",
          {
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: {
              name: "prepare_create",
              arguments: {
                kind: "task",
                title: "Koffie halen",
                description: "",
              },
            },
          },
          "C".repeat(43),
        ),
        a,
        actor,
        env,
      );
    const response = await r.json(),
      result = JSON.parse(response.result.content[0].text);
    assert(result.confirmation_url.includes("mcp_proposal="));
    assert(result.confirmation_required);
    const prepared = a.calls.find((c) => c.op === "prepare")!;
    assert(prepared.p.payload.item.owner_id === owner);
    assert(prepared.p.payload.item.visibility === "private");
    assert(prepared.p.payload.item.assignees.length === 0);
    assert(!a.calls.some((c) => c.op === "proposal_execute"));
  },
);
Deno.test(
  "app consent uses verified account, returns original state and never a provider credential",
  async () => {
    const a = admin(),
      r = await handleMcp(
        req(
          "/",
          {
            action: "consent",
            request_id: requestId,
            user_id: "attacker",
            scopes: ["todo:read"],
          },
          "fixture-app-session",
          { Origin: "https://todo.zsj4j2s4df.workers.dev" },
        ),
        a,
        actor,
        env,
      );
    const result = await r.json(),
      url = new URL(result.redirect_url);
    assert(a.calls[0].p.user_id === owner);
    assert(url.searchParams.get("state") === "original-state");
    assert(url.searchParams.get("iss") === ISSUER);
    assert(url.searchParams.has("code"));
    assert(
      a.calls[0].p.code_hash === (await digest(url.searchParams.get("code")!)),
    );
    const blocked = await handleMcp(
      req(
        "/",
        { action: "consent_info", request_id: requestId },
        "fixture-app-session",
        { Origin: "https://evil.test" },
      ),
      a,
      actor,
      env,
    );
    assert(blocked.status === 403);
  },
);
Deno.test(
  "token exchange hashes tokens and never returns a Supabase or service credential",
  async () => {
    const a = admin(),
      form = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: "https://client.test/callback",
        code: "opaque-code",
        code_verifier: "d".repeat(43),
        resource: RESOURCE,
      });
    const r = await handleMcp(
        req("/token", form.toString(), undefined, {
          "Content-Type": "application/x-www-form-urlencoded",
        }),
        a,
        actor,
        env,
      ),
      result = await r.json();
    assert(r.status === 200);
    assert(result.token_type === "Bearer");
    assert(result.access_token.length === 43);
    assert(result.refresh_token.length === 43);
    assert(a.calls[0].p.access_hash === (await digest(result.access_token)));
    assert(
      a.calls[0].p.refresh_hash_new === (await digest(result.refresh_token)),
    );
    assert(!JSON.stringify(a.calls).includes(result.access_token));
    assert(!result.access_token.includes("."));
  },
);
