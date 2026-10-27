"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/** One bounded recording/transcription path, shared by notes and the assistant. */
export default function VoiceRecorder({
  disabled = false,
  label = "Inspreken",
  onText,
  onBusyChange,
}: {
  disabled?: boolean;
  label?: string;
  onText: (text: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState("idle"),
    [error, setError] = useState("");
  const current = useRef({ onText, onBusyChange });
  current.current = { onText, onBusyChange };
  const generation = useRef(0),
    media = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function tracks() {
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    if (timer.current) clearTimeout(timer.current);
  }
  function cancel() {
    generation.current++;
    tracks();
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    setPhase("idle");
    current.current.onBusyChange?.(false);
  }
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      generation.current++;
      tracks();
      if (recorder.current?.state === "recording") recorder.current.stop();
      current.current.onBusyChange?.(false);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  async function start() {
    if (!supabase || phase !== "idle" || disabled) return;
    const version = ++generation.current;
    setPhase("starting");
    setError("");
    current.current.onBusyChange?.(true);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw Error("Deze browser kan niet opnemen. Typ je tekst.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (version !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      media.current = stream;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      if (!mime) throw Error("Geen ondersteund opnameformaat. Typ je tekst.");
      const rec = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: 32000,
      });
      recorder.current = rec;
      const chunks: Blob[] = [];
      let size = 0;
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          size += e.data.size;
          chunks.push(e.data);
          if (size > 1500000 && rec.state === "recording") rec.stop();
        }
      };
      rec.onerror = () => {
        if (version === generation.current) {
          cancel();
          setError("Opnemen is niet gelukt.");
        }
      };
      rec.onstop = () => {
        tracks();
        if (version !== generation.current) return;
        setPhase("transcribing");
        void supabase!.functions
          .invoke("todo-ai", {
            body: new Blob(chunks, { type: mime }),
            headers: { "Content-Type": mime, "x-todo-action": "transcribe" },
          })
          .then((r) => {
            if (version !== generation.current) return;
            if (r.error || r.data?.error || typeof r.data?.text !== "string")
              throw Error(
                "Spraak omzetten is niet gelukt. Probeer opnieuw of typ je tekst.",
              );
            current.current.onText(r.data.text.slice(0, 5000));
          })
          .catch((e) => {
            if (version === generation.current) setError(e.message);
          })
          .finally(() => {
            if (version === generation.current) {
              setPhase("idle");
              current.current.onBusyChange?.(false);
            }
          });
      };
      rec.start(1000);
      setPhase("recording");
      timer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 30000);
    } catch (e) {
      if (version === generation.current) {
        cancel();
        setError(
          e instanceof Error ? e.message : "Microfoon niet beschikbaar.",
        );
      }
    }
  }
  if (!supabase) return null;
  return (
    <div>
      {phase === "idle" ? (
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={() => void start()}
        >
          {label}
        </button>
      ) : (
        <>
          {phase === "recording" && (
            <button
              type="button"
              className="secondary"
              onClick={() => recorder.current?.stop()}
            >
              Stop opname
            </button>
          )}
          <button type="button" className="text-button" onClick={cancel}>
            Opname annuleren
          </button>
          <p role="status">
            {phase === "recording"
              ? "Microfoon aan, maximaal 30 seconden."
              : phase === "starting"
                ? "Microfoon starten…"
                : "Spraak omzetten…"}
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="hint">
        Alleen tijdens je opname gaat audio naar OpenAI voor transcriptie.
        Controleer de tekst voordat je bewaart. Audio wordt niet als notitie
        opgeslagen.
      </p>
    </div>
  );
}
