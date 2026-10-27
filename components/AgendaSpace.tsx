"use client";
import type { Item } from "@/lib/model";
import { freeBlocks } from "@/lib/schedule";
export default function AgendaSpace({
  items,
  day,
}: {
  items: Item[];
  day: string | null;
}) {
  if (!day) return null;
  let blocks: { start: Date; end: Date }[] = [];
  try {
    blocks = freeBlocks(items, day);
  } catch {
    return <p>Kies een kortere periode om vrije ruimte te bekijken.</p>;
  }
  const time = (d: Date) =>
    d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  return (
    <details className="calendar-options">
      <summary>Vrije ruimte op deze dag</summary>
      <p>
        Venster 08:00–22:00, in de tijdzone van dit apparaat. Alleen op basis
        van zichtbare afspraken; nog niet gekoppelde of verouderde agenda’s
        kunnen ontbreken.
      </p>
      {blocks.length ? (
        <ul>
          {blocks.map((b, n) => (
            <li key={n}>
              {time(b.start)}–{time(b.end)}
            </li>
          ))}
        </ul>
      ) : (
        <p>Geen vrije ruimte binnen dit venster.</p>
      )}
    </details>
  );
}
