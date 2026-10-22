"use client";
import type { Item } from "@/lib/model";
import { dayBrief } from "@/lib/brief";
import type { BriefPreferences } from "@/lib/brief-preferences";
import WeatherBrief from "./WeatherBrief";
import Icon from "./AppIcon";
export default function DayBrief({
  items,
  onOpen,
  preferences: p,
}: {
  items: Item[];
  preferences: BriefPreferences;
  onOpen: (item: Item) => void;
}) {
  const overlaps = dayBrief(items, new Date()).clashes;
  const brief = dayBrief(
    items.filter((i) =>
      i.kind === "event" ? p.events_enabled : p.tasks_enabled,
    ),
    new Date(),
  );
  return (
    <section className="panel day-brief" aria-label="Jouw dagbrief">
      <div className="section-heading">
        <Icon name="notebook" />
        <h2>Een rustig begin</h2>
      </div>
      <p>
        {brief.overdue
          ? `${brief.overdue} ${brief.overdue === 1 ? "item wacht" : "items wachten"} nog van eerder. Je hoeft niet alles tegelijk te doen.`
          : "Kies één ding om mee te beginnen. De rest mag even wachten."}
      </p>
      {brief.next.length ? (
        <ol>
          {brief.next.map((i) => (
            <li key={i.id}>
              <button
                className="text-button"
                aria-label={`Open stap: ${i.title}`}
                onClick={() => onOpen(i)}
              >
                {i.title}
              </button>
              {i.due_at && (
                <small>
                  {" "}
                  ·{" "}
                  {new Date(i.due_at).toLocaleTimeString("nl-NL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">
          Geen geplande stappen voor vandaag. Ook ruimte is een goed plan.
        </p>
      )}
      {p.clashes_enabled && overlaps.length > 0 && (
        <p role="status">
          Er zijn {overlaps.length} overlappende afspraken. Bekijk je agenda om
          een keuze te maken.
        </p>
      )}
      {p.weather_enabled && p.latitude !== null && p.longitude !== null && (
        <WeatherBrief preferences={p} />
      )}
      <p className="hint">
        Maximaal drie stappen, op basis van je zichtbare items. Afspraken komen
        eerst; daarna prioriteit en datum.
      </p>
    </section>
  );
}
