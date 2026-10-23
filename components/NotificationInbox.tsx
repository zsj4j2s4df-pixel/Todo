"use client";
import type { Item } from "@/lib/model";
export type InboxNotification = {
  id: string;
  item_id: string;
  kind: "assignment" | "completion";
  created_at: string;
  read_at: string | null;
};
export type NotificationPreferences = {
  assignment_enabled: boolean;
  completion_enabled: boolean;
};
export default function NotificationInbox({
  notifications,
  items,
  busy,
  onRead,
  onOpen,
  onRefresh,
}: {
  notifications: InboxNotification[];
  items: Item[];
  busy: boolean;
  onRead: (id: string) => void;
  onOpen: (item: Item) => void;
  onRefresh: () => void;
}) {
  return (
    <section
      className="panel notification-inbox"
      aria-label="Meldingen binnen de app"
    >
      <div className="section-heading">
        <h2>Meldingen</h2>
        <span className="count">
          {notifications.filter((n) => !n.read_at).length}
        </span>
        <button className="text-button" disabled={busy} onClick={onRefresh}>
          Vernieuwen
        </button>
      </div>
      <p className="hint">
        Toewijzingen en afrondingen. Vernieuw om nieuwe wijzigingen op te halen.
      </p>
      {notifications.length ? (
        notifications.map((n) => {
          const item = items.find((i) => i.id === n.item_id);
          if (!item) return null;
          return (
            <article
              className={"inbox-row" + (n.read_at ? " is-read" : "")}
              key={n.id}
            >
              <button className="task-info" onClick={() => onOpen(item)}>
                <strong>{item.title}</strong>
                <span>
                  {n.kind === "assignment" ? "Aan jou toegewezen" : "Afgerond"}{" "}
                  · {new Date(n.created_at).toLocaleString("nl-NL")}
                </span>
              </button>
              {!n.read_at && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => onRead(n.id)}
                >
                  Gelezen
                </button>
              )}
            </article>
          );
        })
      ) : (
        <p>
          Nog geen meldingen. Nieuwe toewijzingen en afrondingen verschijnen
          hier na vernieuwen.
        </p>
      )}
    </section>
  );
}
