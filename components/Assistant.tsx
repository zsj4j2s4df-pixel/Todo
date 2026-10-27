"use client";
import { confirmsProposal } from "@/lib/voice-confirmation";
import VoiceRecorder from "./VoiceRecorder";
import RealtimeConversation from "./RealtimeConversation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { aiProposalSchema, AIProposal } from "@/lib/ai-proposal";
import type { Item } from "@/lib/model";
import { frequencies } from "@/lib/schedule";
import Icon from "./AppIcon";
type Proposal = Pick<Item, "title" | "kind" | "description" | "due_at">;
export default function Assistant({
  onDraft,
  onCommit,
}: {
  onDraft: (p: Proposal) => void;
  onCommit: (p: AIProposal) => Promise<void>;
}) {
  const [liveActive, setLiveActive] = useState(false),
    [completed, setCompleted] = useState(0);
  const [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState(""),
    [proposal, setProposal] = useState<AIProposal | null>(null),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [checking, setChecking] = useState(true),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false),
    [readAloud, setReadAloud] = useState(false),
    [autoAsk, setAutoAsk] = useState(false);
  const alive = useRef(true),
    speaking = useRef(false),
    [voiceAvailable, setVoiceAvailable] = useState(false);
  useEffect(() => {
    alive.current = true;
    setVoiceAvailable(
      "mediaDevices" in navigator && typeof MediaRecorder !== "undefined",
    );
    let cancel = false;
    if (!supabase) {
      setChecking(false);
      return;
    }
    void supabase.functions
      .invoke("todo-ai", { body: { action: "status" } })
      .then((r) => {
        if (cancel) return;
        setReady(!!r.data?.ready);
        if (r.error)
          setError(
            "De assistent is nog niet bereikbaar. Probeer later opnieuw.",
          );
        setChecking(false);
      });
    return () => {
      cancel = true;
      alive.current = false;
      if (speaking.current) window.speechSynthesis?.cancel();
    };
  }, []);
  async function commit() {
    if (!proposal || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCommit(proposal);
      if (alive.current) {
        setProposal(null);
        setCompleted((n) => n + 1);
        setAnswer("Uitgevoerd. Je overzicht is bijgewerkt.");
        if (readAloud && !liveActive && "speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(
            "Uitgevoerd. Je overzicht is bijgewerkt.",
          );
          u.lang = "nl-NL";
          window.speechSynthesis.speak(u);
        }
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Uitvoeren is niet gelukt.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function ask(text = question) {
    if (!supabase || !text.trim() || busy || liveActive) return;
    if (proposal && confirmsProposal(text, proposal.action)) {
      await commit();
      return;
    }
    setBusy(true);
    setError("");
    setAnswer("");
    setProposal(null);
    try {
      const r = await supabase.functions.invoke("todo-ai", {
        body: {
          action: "chat",
          question: text.trim().slice(0, 2000),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      if (!alive.current) return;
      if (r.error)
        throw Error(
          "De vraag kon niet worden verwerkt. Controleer je verbinding of probeer het later opnieuw.",
        );
      if (r.data?.error) throw Error(r.data.error);
      const message = typeof r.data?.answer === "string" ? r.data.answer : "";
      setAnswer(message);
      if (r.data?.proposal)
        setProposal(aiProposalSchema.parse(r.data.proposal));
      if (readAloud && !liveActive && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = "nl-NL";
        utterance.onend = () => {
          speaking.current = false;
        };
        speaking.current = true;
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Antwoord ophalen is niet gelukt.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="panel assistant-panel" aria-label="Todo-assistent">
      <div className="section-heading">
        <Icon name="notebook" />
        <h2>Even samen nadenken</h2>
      </div>
      <p>
        Vraag om overzicht, zoek iets terug of maak een kleine volgende stap. De
        assistent kan zoeken in je zichtbare taken, afspraken, herinneringen en
        checklists.
      </p>
      {!supabase ? (
        <p>De assistent vereist een ingelogd account.</p>
      ) : checking ? (
        <p role="status">Assistent controleren…</p>
      ) : !ready ? (
        <p>
          De assistent is nog niet geactiveerd. Je kunt Todo gewoon blijven
          gebruiken.
        </p>
      ) : (
        <>
          <RealtimeConversation
            disabled={busy || recording}
            pendingProposal={!!proposal}
            onProposal={setProposal}
            onActiveChange={setLiveActive}
            completed={completed}
            onTranscript={(text) => {
              if (proposal && confirmsProposal(text, proposal.action))
                void commit();
            }}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label>
              Jouw vraag
              <textarea
                value={question}
                maxLength={2000}
                required
                placeholder="Waar kan ik vandaag het beste mee beginnen?"
                disabled={busy || recording || liveActive}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
            <div className="assistant-actions">
              <button
                className="primary"
                disabled={busy || recording || liveActive || !question.trim()}
              >
                Vraag stellen
              </button>
              {voiceAvailable && (
                <VoiceRecorder
                  label="Vraag inspreken"
                  disabled={busy || liveActive}
                  onBusyChange={setRecording}
                  onText={(text) => {
                    setQuestion(text.slice(0, 2000));
                    if (autoAsk && text.trim()) void ask(text.slice(0, 2000));
                  }}
                />
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  window.speechSynthesis?.cancel();
                  speaking.current = false;
                }}
              >
                Stop voorlezen
              </button>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={readAloud}
                onChange={(e) => setReadAloud(e.target.checked)}
              />
              Antwoord voorlezen met de stem van dit apparaat
            </label>
            {voiceAvailable && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={autoAsk}
                  onChange={(e) => setAutoAsk(e.target.checked)}
                />
                Na inspreken direct antwoord vragen
              </label>
            )}
          </form>
          {busy && <p role="status">Even kijken…</p>}
          {answer && (
            <div className="assistant-answer" aria-live="polite">
              {answer}
            </div>
          )}
          {proposal && (
            <div className="draft-preview">
              <h3>
                {proposal.action === "note_create"
                  ? "Notitie bewaren"
                  : proposal.action === "create"
                    ? "Toevoegen: " + proposal.item.title
                    : proposal.action === "delete"
                      ? "Verwijderen: " + proposal.target_title
                      : proposal.action === "complete"
                        ? (proposal.done ? "Afronden: " : "Heropenen: ") +
                          proposal.target_title
                        : "Wijzigen: " + proposal.target_title}
              </h3>
              {proposal.action === "note_create" && <p>{proposal.body}</p>}
              {proposal.action === "create" && (
                <p>
                  {proposal.item.description}
                  {proposal.item.repeat_kind !== "none" &&
                    ` · ${frequencies[proposal.item.repeat_kind]}`}
                  {proposal.item.due_at &&
                    ` · ${new Date(proposal.item.due_at).toLocaleString("nl-NL")}`}
                </p>
              )}
              {proposal.action === "update" && (
                <p>
                  {Object.entries(proposal.patch)
                    .map(
                      ([key, value]) =>
                        `${key === "title" ? "Titel" : key === "description" ? "Notitie" : key === "repeat_kind" ? "Herhalen" : "Datum"}: ${key === "due_at" && value ? new Date(value).toLocaleString("nl-NL") : value || "geen"}`,
                    )
                    .join(" · ")}
                </p>
              )}
              <p>
                Nog niet uitgevoerd. Zeg “
                {proposal.action === "delete" ? "ja verwijderen" : "ja opslaan"}
                ” of gebruik de knop.
              </p>
              <button
                className="secondary"
                disabled={busy || recording}
                onClick={() => void commit()}
              >
                {proposal.action === "delete"
                  ? "Verwijderen bevestigen"
                  : "Voorstel uitvoeren"}
              </button>
              {proposal.action === "create" && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    onDraft(proposal.item);
                    setProposal(null);
                  }}
                >
                  Eerst bewerken
                </button>
              )}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setProposal(null)}
              >
                Voorstel annuleren
              </button>
            </div>
          )}
          <p className="hint">
            Je vraag, eventuele opname en voor het antwoord benodigde zichtbare
            Todo-gegevens gaan naar OpenAI. Alleen na jouw actie; de AI voert
            beheeracties pas uit na jouw bevestiging. API-gebruik kan kosten
            meebrengen en is begrensd. Antwoorden kunnen fouten bevatten.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
