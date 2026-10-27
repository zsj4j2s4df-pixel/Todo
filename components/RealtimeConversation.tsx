"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AIProposal, aiProposalSchema } from "@/lib/ai-proposal";
type Props = {
  disabled: boolean;
  pendingProposal: boolean;
  onProposal: (p: AIProposal) => void;
  onActiveChange: (active: boolean) => void;
  completed: number;
  onTranscript: (text: string) => void;
};
export default function RealtimeConversation(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const [active, setActive] = useState(false),
    [starting, setStarting] = useState(false),
    [message, setMessage] = useState(""),
    [heard, setHeard] = useState(""),
    [said, setSaid] = useState("");
  const runtime = useRef<{
    peer: RTCPeerConnection;
    stream: MediaStream;
    channel: RTCDataChannel;
    audio: HTMLAudioElement;
    timer?: ReturnType<typeof setTimeout>;
    sessionId?: string;
    generation: number;
    responding: boolean;
    notice?: string;
    responseId?: string;
    replyNeeded?: boolean;
    queue: Promise<void>;
    calls: Set<string>;
  } | null>(null);
  const generation = useRef(0),
    mounted = useRef(true);
  async function invoke(body: Record<string, unknown>) {
    const r = await supabase!.functions.invoke("todo-ai", { body });
    if (r.error) {
      try {
        const detail = await r.error.context?.json();
        if (typeof detail?.error === "string") throw Error(detail.error);
      } catch (e) {
        if (e instanceof Error && e.name === "Error") throw e;
      }
      throw Error("Livegesprek tijdelijk niet beschikbaar. Probeer opnieuw.");
    }
    if (r.data?.error) throw Error(r.data.error);
    return r.data;
  }
  function send(event: unknown) {
    const r = runtime.current;
    if (r?.channel.readyState === "open") r.channel.send(JSON.stringify(event));
  }
  function speakNotice() {
    const r = runtime.current;
    if (
      r &&
      (r.notice || r.replyNeeded) &&
      !r.responding &&
      r.channel.readyState === "open"
    ) {
      if (r.notice) {
        const text = r.notice;
        r.notice = undefined;
        send({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text }],
          },
        });
      }
      r.replyNeeded = false;
      r.responding = true;
      send({ type: "response.create" });
    }
  }
  async function stop(notice = "Livegesprek gestopt. Microfoon staat uit.") {
    generation.current++;
    const r = runtime.current;
    runtime.current = null;
    if (r) {
      if (r.timer) clearTimeout(r.timer);
      r.channel.close();
      r.peer.close();
      r.stream.getTracks().forEach((t) => t.stop());
      r.audio.pause();
      r.audio.srcObject = null;
      r.audio.remove();
      if (r.sessionId)
        void invoke({ action: "realtime_stop", session_id: r.sessionId }).catch(
          () => {
            /* server cleanup remains scheduled */
          },
        );
    }
    if (mounted.current) {
      setStarting(false);
      setActive(false);
      setMessage(notice);
      latest.current.onActiveChange(false);
    }
  }
  async function handle(event: MessageEvent, version: number) {
    const r = runtime.current;
    if (!r || r.generation !== version) return;
    let data: any;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (
      data.type === "conversation.item.input_audio_transcription.completed" &&
      typeof data.transcript === "string"
    ) {
      setHeard(data.transcript.slice(0, 2000));
      latest.current.onTranscript(data.transcript.slice(0, 2000));
    }
    if (
      data.type === "response.output_audio_transcript.done" &&
      typeof data.transcript === "string"
    )
      setSaid(data.transcript.slice(0, 5000));
    if (data.type === "response.created") {
      r.responding = true;
      r.responseId = data.response?.id;
    }
    if (data.type === "error") {
      setMessage(
        "Het gesprek kon een stap niet afronden. Probeer opnieuw of gebruik de gewone assistent.",
      );
      return;
    }
    if (data.type !== "response.done") return;
    if (!r.responseId || r.responseId === data.response?.id)
      r.responding = false;
    const calls = (
      Array.isArray(data.response?.output) ? data.response.output : []
    ).filter((o: any) => o.type === "function_call");
    if (calls.length > 3) {
      await stop("Het gesprek vroeg te veel stappen. Maak je vraag kleiner.");
      return;
    }
    let proposed = latest.current.pendingProposal,
      processed = 0;
    for (const call of calls) {
      if (typeof call.call_id !== "string" || r.calls.has(call.call_id))
        continue;
      r.calls.add(call.call_id);
      processed++;
      let value: unknown;
      try {
        if (proposed && String(call.name).startsWith("prepare_"))
          throw Error("Bevestig of annuleer eerst het bestaande voorstel.");
        const result = await invoke({
          action: "realtime_tool",
          session_id: r.sessionId,
          name: call.name,
          args: JSON.parse(call.arguments || "{}"),
        });
        if (runtime.current !== r) return;
        if (result.proposal) {
          proposed = true;
          latest.current.onProposal(aiProposalSchema.parse(result.proposal));
        }
        value = result.value;
      } catch (e) {
        value = {
          error: e instanceof Error ? e.message : "Zoeken niet gelukt",
        };
      }
      if (runtime.current !== r) return;
      send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(value),
        },
      });
    }
    if (runtime.current !== r) return;
    if (processed) r.replyNeeded = true;
    speakNotice();
  }
  async function start() {
    if (starting || active || props.disabled || !supabase) return;
    const version = ++generation.current;
    latest.current.onActiveChange(true);
    setStarting(true);
    setMessage("Microfoon en verbinding starten…");
    setHeard("");
    setSaid("");
    let media: MediaStream | null = null;
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof RTCPeerConnection === "undefined"
      )
        throw Error(
          "Deze browser ondersteunt geen livegesprek. Gebruik typen of een korte opname.",
        );
      media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (version !== generation.current || !mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      const peer = new RTCPeerConnection();
      const channel = peer.createDataChannel("oai-events");
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      const r = {
        peer,
        stream: media,
        channel,
        audio,
        generation: version,
        responding: false,
        calls: new Set<string>(),
        queue: Promise.resolve(),
      } as NonNullable<typeof runtime.current>;
      runtime.current = r;
      peer.ontrack = (e) => {
        if (runtime.current === r) {
          audio.srcObject = e.streams[0] || new MediaStream([e.track]);
          void audio
            .play()
            .catch(() =>
              setMessage("Tik op de afspeelknop om het antwoord te horen."),
            );
        }
      };
      media.getTracks().forEach((t) => peer.addTrack(t, media!));
      channel.onmessage = (e) => {
        let type = "";
        try {
          type = JSON.parse(e.data).type;
        } catch {
          return;
        }
        if (type === "response.done")
          r.queue = r.queue
            .then(() => handle(e, version))
            .catch(() => stop("Het gesprek is gestopt. Probeer opnieuw."));
        else void handle(e, version);
      };
      peer.onconnectionstatechange = () => {
        if (runtime.current !== r) return;
        if (["failed", "closed", "disconnected"].includes(peer.connectionState))
          void stop("De verbinding is verbroken. Je microfoon staat uit.");
      };
      await peer.setLocalDescription(await peer.createOffer());
      const result = await invoke({
        action: "realtime_start",
        sdp: peer.localDescription?.sdp,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (runtime.current !== r) {
        if (result.session_id)
          void invoke({
            action: "realtime_stop",
            session_id: result.session_id,
          }).catch(() => {});
        return;
      }
      r.sessionId = result.session_id;
      if (typeof result.sdp !== "string" || !result.sdp.startsWith("v=0"))
        throw Error("Geen geldig verbindingsantwoord ontvangen.");
      await peer.setRemoteDescription({ type: "answer", sdp: result.sdp });
      r.timer = setTimeout(
        () =>
          void stop(
            "Je korte livegesprek is afgelopen. Je kunt later opnieuw starten.",
          ),
        Math.min(90, Math.max(1, result.duration_seconds || 90)) * 1000,
      );
      setStarting(false);
      setActive(true);
      setMessage(
        "Je kunt praten en het antwoord onderbreken. Bevestig een voorstel met “ja opslaan”, “ja verwijderen” of de knop.",
      );
      latest.current.onActiveChange(true);
    } catch (e) {
      media?.getTracks().forEach((t) => t.stop());
      if (version === generation.current)
        await stop(
          e instanceof Error
            ? e.message
            : "Livegesprek starten is niet gelukt.",
        );
    }
  }
  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      if (document.visibilityState === "hidden") void stop();
    };
    const leave = () => void stop();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      void stop();
    };
  }, []);
  useEffect(() => {
    const r = runtime.current;
    if (r && props.completed) {
      r.notice =
        "De app bevestigt: het voorstel is zojuist met succes door de gebruiker uitgevoerd. Vertel kort dat het klaar is en voer niets opnieuw uit.";
      speakNotice();
    }
  }, [props.completed]);
  return (
    <section aria-label="Livegesprek">
      <h3>Live praten met de assistent</h3>
      <p>
        Een kort gesprek met directe gesproken antwoorden. Je kunt het antwoord
        onderbreken. Maximaal 90 seconden; dagelijks maximaal zes gesprekken per
        account.
      </p>
      <button
        className="secondary"
        type="button"
        disabled={props.disabled || starting || active}
        onClick={() => void start()}
      >
        Livegesprek starten
      </button>
      {(starting || active) && (
        <button className="secondary" type="button" onClick={() => void stop()}>
          Livegesprek stoppen
        </button>
      )}
      {active && (
        <button
          className="text-button"
          type="button"
          onClick={() =>
            void runtime.current?.audio
              .play()
              .catch(() =>
                setMessage("Geluid afspelen is geblokkeerd door je browser."),
              )
          }
        >
          Antwoord afspelen
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {heard && (
        <p>
          <strong>Jij:</strong> {heard}
        </p>
      )}
      {said && (
        <p>
          <strong>Assistent:</strong> {said}
        </p>
      )}
      <p className="hint">
        Tijdens dit gesprek gaat microfoonaudio naar OpenAI. Stoppen, uitloggen
        of het tabblad verlaten schakelt de microfoon uit. Je permanente
        API-sleutel blijft op de server. Realtime-gebruik heeft eigen
        API-kosten.
      </p>
    </section>
  );
}
