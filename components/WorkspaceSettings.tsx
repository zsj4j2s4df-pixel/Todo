"use client";
import type { Item } from "@/lib/model";
import type { ItemTemplate, Note } from "@/lib/workspace";
export default function WorkspaceSettings({
  trash,
  notes,
  templates,
  busy,
  onRestore,
  onPurge,
  onNoteState,
  onPurgeNote,
  onTemplate,
  onDeleteTemplate,
}: {
  user: string;
  trash: Item[];
  notes: Note[];
  templates: ItemTemplate[];
  busy: boolean;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onNoteState: (n: Note, state: Note["state"]) => void;
  onPurgeNote: (n: Note) => void;
  onTemplate: (t: ItemTemplate) => void;
  onDeleteTemplate: (id: string) => void;
}) {
  return (
    <>
      <details>
        <summary>Mijn sjablonen ({templates.length})</summary>
        <p>
          Nieuwe lijstjes beginnen privé en met open stappen. Bewaar een lijst
          als sjabloon vanuit het bewerkscherm.
        </p>
        {templates.map((t) => (
          <div className="inbox-entry" key={t.id}>
            <strong>{t.name}</strong>
            <div className="assistant-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => onTemplate(t)}
              >
                Gebruik sjabloon
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => onDeleteTemplate(t.id)}
              >
                Sjabloon verwijderen
              </button>
            </div>
          </div>
        ))}
      </details>
      <details>
        <summary>
          Bewaarde notities ({notes.filter((n) => n.state === "kept").length})
        </summary>
        {notes
          .filter((n) => n.state === "kept")
          .map((n) => (
            <div className="inbox-entry" key={n.id}>
              <p className="note-text">{n.body}</p>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => onNoteState(n, "inbox")}
              >
                Terug naar mijn inbox
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => onNoteState(n, "trash")}
              >
                Notitie verwijderen
              </button>
            </div>
          ))}
      </details>
      <details>
        <summary>
          Verwerkte notities (
          {notes.filter((n) => n.state === "converted").length})
        </summary>
        {notes
          .filter((n) => n.state === "converted")
          .map((n) => (
            <div className="inbox-entry" key={n.id}>
              <p className="note-text">{n.body}</p>
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
          ))}
      </details>
      <details>
        <summary>
          Mijn prullenbak (
          {trash.length + notes.filter((n) => n.state === "trash").length})
        </summary>
        <p>
          Herstel taken en afspraken als privé-item. Deel ze daarna opnieuw als
          je dat wilt. Er wordt niets automatisch definitief verwijderd.
        </p>
        {trash.map((i) => (
          <div className="inbox-entry" key={i.id}>
            <strong>{i.title}</strong>
            {i.source_deleted && (
              <p className="hint">
                Verwijderd in de bronagenda; herstel gebeurt daar.
              </p>
            )}
            {i.integration_id && !i.source_deleted && (
              <p className="hint">
                Verborgen in Todo. Verwijder in de bron of ontkoppel om de kopie
                definitief te verwijderen.
              </p>
            )}
            <div className="assistant-actions">
              <button
                className="secondary"
                disabled={busy || i.source_deleted}
                onClick={() => onRestore(i.id)}
              >
                Herstel {i.title}
              </button>
              <button
                className="text-button"
                disabled={busy || (!!i.integration_id && !i.source_deleted)}
                onClick={() => onPurge(i.id)}
              >
                Definitief verwijderen
              </button>
            </div>
          </div>
        ))}
        {notes
          .filter((n) => n.state === "trash")
          .map((n) => (
            <div className="inbox-entry" key={n.id}>
              <p className="note-text">{n.body}</p>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => onNoteState(n, "inbox")}
              >
                Herstel notitie
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => onPurgeNote(n)}
              >
                Notitie definitief verwijderen
              </button>
            </div>
          ))}
      </details>
    </>
  );
}
