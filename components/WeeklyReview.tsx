"use client";
import type { Item } from "@/lib/model";
export default function WeeklyReview({
  items,
  user,
  busy,
  onKeep,
  onPostpone,
  onRemove,
}: {
  items: Item[];
  user: string;
  busy: boolean;
  onKeep: (item: Item) => void;
  onPostpone: (item: Item) => void;
  onRemove: (item: Item) => void;
}) {
  const week = Date.now() - 7 * 86400000;
  const old = items
    .filter(
      (i) =>
        i.kind === "task" &&
        i.owner_id === user &&
        i.status === "open" &&
        Date.parse(i.reviewed_at || i.updated_at) < week,
    )
    .slice(0, 5);
  if (!old.length) return null;
  return (
    <details className="calendar-options">
      <summary>Even opruimen deze week · {old.length} oude taken</summary>
      <p>Jij kiest wat mag blijven. We veranderen niets vanzelf.</p>
      {old.map((i) => (
        <div className="inbox-entry" key={i.id}>
          <strong>{i.title}</strong>
          <div className="assistant-actions">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onKeep(i)}
            >
              Bewaren
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onPostpone(i)}
            >
              Uitstellen naar datum
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onRemove(i)}
            >
              Verwijderen
            </button>
          </div>
        </div>
      ))}
    </details>
  );
}
