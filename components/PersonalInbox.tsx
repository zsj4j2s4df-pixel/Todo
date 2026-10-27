"use client";
import { useState } from "react";
import type { Item, Member } from "@/lib/model";
import { assigneeLabel, type Note } from "@/lib/workspace";
import VoiceRecorder from "./VoiceRecorder";
import Icon from "./AppIcon";
export default function PersonalInbox({
  user,
  notes,
  items,
  handled,
  members,
  busy,
  onCreateNote,
  onNoteState,
  onConvert,
  onOpen,
  onHandle,
}: {
  user: string;
  notes: Note[];
  items: Item[];
  handled: string[];
  members: Member[];
  busy: boolean;
  onCreateNote: (body: string, source: Note["source_type"]) => Promise<boolean>;
  onNoteState: (note: Note, state: Note["state"]) => void;
  onConvert: (note: Note, kind: Item["kind"]) => void;
  onOpen: (item: Item) => void;
  onHandle: (id: string) => void;
}) {
  const [body, setBody] = useState(""),
    [source, setSource] = useState<Note["source_type"]>("text"),
    [voiceBusy, setVoiceBusy] = useState(false),
    [limit, setLimit] = useState(5);
  const pending = notes.filter((n) => n.state === "inbox"),
    assigned = items.filter(
      (i) =>
        i.status === "open" &&
        i.assignees.includes(user) &&
        !handled.includes(i.id),
    );
  return (
    <section
      className="panel personal-inbox"
      aria-label="Jouw persoonlijke inbox"
    >
      <div className="section-heading">
        <Icon name="notebook" />
        <h2>Even uit je hoofd</h2>
        <span className="count">{pending.length + assigned.length}</span>
      </div>
      <p>
        Je persoonlijke verwerkbak. Onverwerkte notities komen hier dagelijks
        terug; alleen lezen handelt ze niet af.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onCreateNote(body, source)) {
            setBody("");
            setSource("text");
          }
        }}
      >
        <label>
          Losse gedachte
          <textarea
            value={body}
            maxLength={5000}
            required
            disabled={busy || voiceBusy}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <div className="assistant-actions">
          <button
            className="secondary"
            disabled={busy || voiceBusy || !body.trim()}
          >
            Bewaar in mijn inbox
          </button>
          <VoiceRecorder
            disabled={busy}
            label="Notitie inspreken"
            onBusyChange={setVoiceBusy}
            onText={(text) => {
              setBody(text);
              setSource("voice");
            }}
          />
        </div>
      </form>
      {pending.slice(0, limit).map((n) => (
        <article className="inbox-entry" key={n.id}>
          <p className="note-text">{n.body}</p>
          <small>
            {new Date(n.created_at).toLocaleDateString("nl-NL")} ·{" "}
            {n.source_type === "voice"
              ? "Ingesproken"
              : n.source_type === "gmail"
                ? "Geselecteerde mail"
                : "Notitie"}
          </small>
          <div className="assistant-actions">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onConvert(n, "task")}
            >
              Maak taak
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onConvert(n, "event")}
            >
              Maak afspraak
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onNoteState(n, "kept")}
            >
              Bewaar voor later
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onNoteState(n, "trash")}
            >
              Notitie verwijderen
            </button>
          </div>
        </article>
      ))}
      {pending.length > limit && (
        <button className="text-button" onClick={() => setLimit(limit + 10)}>
          Meer notities tonen
        </button>
      )}
      {assigned.map((i) => (
        <article className="inbox-entry" key={i.id}>
          <button className="text-button" onClick={() => onOpen(i)}>
            {i.title}
          </button>
          <p className="hint">{assigneeLabel(i, user, members)}</p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => onHandle(i.id)}
          >
            Gezien, uit mijn inbox
          </button>
        </article>
      ))}
      <p className="hint">
        Bewaarde notities vind je bij Instellingen. Een toewijzing uit je inbox
        halen rondt de taak niet af. Andere apparaten verversen via Vernieuwen.
      </p>
    </section>
  );
}
