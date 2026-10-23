import { tools, assistantInstructions, runTool } from "./chat.ts";
import { validId } from "./tool-policy.ts";
import { realtimeCallId, hangupRealtime } from "../_shared/realtime.ts";
export async function realtimeRequest(
  client: any,
  admin: any,
  userId: string,
  key: string,
  body: any,
  model: string,
  apiFetch: typeof fetch = fetch,
) {
  if (body.action === "realtime_stop") {
    if (!validId(body.session_id)) throw Error("Ongeldige sessie");
    const r = await client.rpc("request_realtime_stop", {
      session_id: body.session_id,
    });
    if (r.error) throw Error("Dit gesprek is niet van dit account");
    if (r.data && (await hangupRealtime(key, r.data, apiFetch)))
      await admin.rpc("finish_realtime_call", {
        session_id: body.session_id,
        provider_call_id: r.data,
      });
    return { stopped: true };
  }
  if (body.action === "realtime_tool") {
    if (
      !validId(body.session_id) ||
      typeof body.name !== "string" ||
      !body.args ||
      typeof body.args !== "object" ||
      Array.isArray(body.args)
    )
      throw Error("Ongeldige toolinvoer");
    const allowed = await client.rpc("reserve_realtime_tool", {
      session_id: body.session_id,
    });
    if (allowed.error || !allowed.data)
      throw Error("Het livegesprek is verlopen of de zoeklimiet is bereikt");
    return await runTool(client, userId, body.name, body.args);
  }
  if (
    body.action !== "realtime_start" ||
    typeof body.sdp !== "string" ||
    !body.sdp.startsWith("v=0") ||
    body.sdp.length > 32000
  )
    throw Error("Ongeldig verbindingsaanbod");
  let timezone = "Europe/Amsterdam";
  try {
    new Intl.DateTimeFormat("nl", { timeZone: body.timezone });
    if (typeof body.timezone === "string") timezone = body.timezone;
  } catch {
    /* use default */
  }
  const slot = await client.rpc("reserve_realtime_session");
  if (slot.error || !slot.data)
    throw Error(
      "Livegesprek starten kan nu niet. Er is al een gesprek actief of de daglimiet is bereikt.",
    );
  const id = slot.data;
  let callId: string | null = null;
  try {
    const form = new FormData();
    form.set("sdp", body.sdp);
    form.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model,
        instructions:
          assistantInstructions(timezone) +
          " Spreek Nederlands, kort en rustig. Dit is een livegesprek. Laat gebruikers wijzigingen bevestigen met de knop of de exacte gesproken woorden ja opslaan, ja uitvoeren of ja verwijderen. Maak bij een bevestiging geen nieuw voorstel; wacht tot de app het resultaat meldt. Je kunt zelf niets uitvoeren. Zeg nooit dat een voorstel is opgeslagen. Rond binnen twee minuten af.",
        tools,
        max_output_tokens: 800,
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe", language: "nl" },
            turn_detection: {
              type: "server_vad",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: { voice: "marin" },
        },
      }),
    );
    const response = await apiFetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(
        "OpenAI kon het livegesprek niet starten. Controleer Realtime-modeltoegang en API-tegoed.",
      );
    }
    callId = realtimeCallId(response.headers.get("Location"));
    const sdp = await response.text();
    if (!sdp.startsWith("v=0") || sdp.length > 64000)
      throw Error("OpenAI gaf geen geldig verbindingsantwoord");
    const attached = await admin.rpc("attach_realtime_call", {
      session_id: id,
      owner_id: userId,
      provider_call_id: callId,
    });
    if (attached.error || !attached.data)
      throw Error("De sessie is verlopen tijdens het verbinden");
    return { session_id: id, sdp, duration_seconds: 90 };
  } catch (e) {
    if (!callId || (await hangupRealtime(key, callId, apiFetch)))
      await admin.rpc("finish_realtime_call", {
        session_id: id,
        provider_call_id: callId,
      });
    // If hangup failed, preserve an attached call for server cleanup.
    else
      await admin.rpc("attach_realtime_call", {
        session_id: id,
        owner_id: userId,
        provider_call_id: callId,
      });
    throw e;
  }
}
