// Own shared-secret authentication below: gateway verify_jwt is deliberately off.
// VAPID credentials stay in Vault; service_role exists only in this server runtime.
import { fetchWeather } from "../_shared/weather.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { allowedPushEndpoint } from "./endpoint.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("x-dispatch-key");
  if (!token || token.length < 32 || token.length > 256)
    return new Response("Unauthorized", { status: 401 });
  const { data, error } = await client.rpc("claim_push_jobs", {
    dispatch_key: token,
  });
  if (error)
    return new Response("Unauthorized or unavailable", { status: 401 });
  let accepted = 0;
  const forecasts = new Map<
    string,
    Promise<Awaited<ReturnType<typeof fetchWeather>> | null>
  >();
  async function send(job: (typeof data.jobs)[number]) {
    let status = 400;
    if (allowedPushEndpoint(job.subscription.endpoint)) {
      try {
        const body =
          job.kind === "morning"
            ? "Je dagbrief staat klaar. Begin met één kleine stap."
            : job.kind === "reminder"
              ? "Er staat een herinnering voor je klaar."
              : "Er is iets veranderd in je taken. Open Todo voor de details.";
        let weather = null;
        if (job.weather) {
          const cacheKey = JSON.stringify(job.weather);
          if (!forecasts.has(cacheKey))
            forecasts.set(
              cacheKey,
              fetchWeather(job.weather, AbortSignal.timeout(5000)).catch(
                () => null,
              ),
            );
          weather = (await forecasts.get(cacheKey))?.moments || null;
        }
        const request = webpush.generateRequestDetails(
          job.subscription,
          JSON.stringify({
            title: "Todo",
            body,
            tag: job.tag,
            url: "/",
            weather,
          }),
          {
            TTL: 3600,
            vapidDetails: {
              subject: "https://todo.zsj4j2s4df.workers.dev",
              publicKey: data.publicKey,
              privateKey: data.privateKey,
            },
          },
        );
        const response = await fetch(request.endpoint, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
        status = response.status;
        await response.body?.cancel();
      } catch {
        status = 503;
      }
    }
    const ack = await client.rpc("finish_push_job", {
      job_id: job.id,
      claim_lease: job.lease,
      http_status: status,
    });
    if (ack.error) throw new Error("Acknowledgement unavailable");
    if (status >= 200 && status < 300) accepted++;
  }
  try {
    for (let index = 0; index < data.jobs.length; index += 10)
      await Promise.all(data.jobs.slice(index, index + 10).map(send));
  } catch {
    return new Response("Acknowledgement unavailable", { status: 503 });
  }
  return Response.json({ processed: data.jobs.length, accepted });
});
