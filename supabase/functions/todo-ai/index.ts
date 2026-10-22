import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { answerQuestion } from "./chat.ts";
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
      "authorization,apikey,content-type,x-client-info,x-todo-action",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "");
  if (!token) return json({ error: "Log eerst in." }, 401);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const user = await client.auth.getUser(token);
  if (user.error || !user.data.user)
    return json({ error: "Log opnieuw in." }, 401);
  const key = Deno.env.get("OPENAI_API_KEY");
  try {
    const isAudio = req.headers.get("x-todo-action") === "transcribe";
    const max = isAudio ? 2 * 1024 * 1024 : 16000;
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > max) {
          await reader.cancel();
          return json({ error: "De invoer is te groot." }, 413);
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(length);
    let pos = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, pos);
      pos += chunk.length;
    }
    const body = isAudio
      ? null
      : JSON.parse(new TextDecoder().decode(bytes) || "{}");
    if (body?.action === "status")
      return json({
        ready: !!key,
        model: Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
      });
    if (!key)
      return json(
        { error: "De assistent is nog niet geactiveerd door de beheerder." },
        503,
      );
    if (
      !isAudio &&
      (body?.action !== "chat" ||
        typeof body.question !== "string" ||
        !body.question.trim() ||
        body.question.length > 2000)
    )
      return json({ error: "Stel een vraag van maximaal 2000 tekens." }, 400);
    if (
      isAudio &&
      (!length ||
        !["audio/webm", "audio/ogg", "audio/mp4"].some((t) =>
          (req.headers.get("content-type") || "").startsWith(t),
        ))
    )
      return json(
        { error: "Gebruik een korte audio-opname van maximaal 30 seconden." },
        400,
      );
    const quota = await client.rpc("reserve_ai_request");
    if (quota.error)
      return json({ error: "AI is tijdelijk niet beschikbaar." }, 503);
    if (!quota.data)
      return json(
        {
          error: "De AI-gebruikslimiet is bereikt. Probeer het later opnieuw.",
        },
        429,
      );
    if (isAudio) {
      const type = (req.headers.get("content-type") || "audio/webm").split(
        ";",
      )[0];
      const extension =
        type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
      const form = new FormData();
      form.append("file", new File([bytes], `vraag.${extension}`, { type }));
      form.append("model", "gpt-4o-mini-transcribe");
      form.append("language", "nl");
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(45000),
      });
      if (!r.ok)
        return json(
          {
            error:
              "Spraak omzetten is niet gelukt. Typ je vraag of probeer opnieuw.",
          },
          502,
        );
      const data = await r.json();
      return json({
        text: typeof data.text === "string" ? data.text.slice(0, 2000) : "",
      });
    }
    let timezone =
      typeof body.timezone === "string" ? body.timezone : "Europe/Amsterdam";
    try {
      new Intl.DateTimeFormat("nl", { timeZone: timezone });
    } catch {
      timezone = "Europe/Amsterdam";
    }
    return json(
      await answerQuestion(
        client,
        key,
        body.question.trim(),
        timezone,
        Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
        user.data.user.id,
      ),
    );
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error &&
          /^(OpenAI|Geen antwoord|Maak je vraag|Deze vraag)/.test(e.message)
            ? e.message
            : "De assistent kon de vraag niet afronden. Probeer opnieuw.",
      },
      502,
    );
  }
});
