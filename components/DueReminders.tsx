"use client";
import { useEffect, useState } from "react";
import type { Item } from "@/lib/model";
export default function DueReminders({
  items,
  enabled,
  busy,
  user,
  onOpen,
  onSnooze,
}: {
  items: Item[];
  enabled: boolean;
  busy: boolean;
  user: string;
  onOpen: (item: Item) => void;
  onSnooze: (item: Item) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  if (!enabled) return null;
  const due = items.filter(
    (i) =>
      i.kind === "reminder" &&
      i.status === "open" &&
      i.due_at &&
      new Date(i.due_at).getTime() <= now &&
      !hidden.includes(i.id + ":" + i.due_at),
  );
  if (!due.length) return null;
  return (
    <section
      className="due-reminders"
      role="region"
      aria-label="Herinneringen die nu aandacht vragen"
    >
      <h2>Even aan denken</h2>
      <p className="hint" role="status">
        {due.length}{" "}
        {due.length === 1 ? "herinnering vraagt" : "herinneringen vragen"}{" "}
        aandacht. Dit overzicht werkt zolang de app open is.
      </p>
      {due.slice(0, 3).map((item) => (
        <div className="due-row" key={item.id}>
          <button className="text-button" onClick={() => onOpen(item)}>
            {item.title}
          </button>
          <div>
            {item.owner_id === user && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => onSnooze(item)}
              >
                10 min uitstellen
              </button>
            )}
            <button
              className="text-button"
              onClick={() =>
                setHidden((old) => [...old, item.id + ":" + item.due_at])
              }
            >
              Verberg
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
