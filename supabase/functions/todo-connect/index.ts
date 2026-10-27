import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { connectorAction } from "./service.ts";
import { ProviderError } from "./policy.ts";
const origins = [
  "https://todo.zsj4j2s4df.workers.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !origins.includes(origin))
    return new Response("Origin not allowed", { status: 403 });
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Origin": origin || origins[0],
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const jwt = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!jwt) return json({ error: "Log eerst in." }, 401);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const user = await client.auth.getUser(jwt);
  if (user.error || !user.data.user)
    return json({ error: "Log opnieuw in." }, 401);
  try {
    const reader = req.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 32000) {
          await reader.cancel();
          return json({ error: "Invoer te groot" }, 413);
        }
        chunks.push(value);
      }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes) || "{}");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    return json(
      await connectorAction(admin, client, user.data.user.id, body, Deno.env),
    );
  } catch (e) {
    return json(
      {
        error:
          e instanceof ProviderError
            ? e.message
            : "De verbinding kon niet worden verwerkt. Probeer opnieuw.",
        code: e instanceof ProviderError ? e.code : "network",
      },
      400,
    );
  }
});
