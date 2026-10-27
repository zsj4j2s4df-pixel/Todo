"use client";
import { Temporal } from "@js-temporal/polyfill";
import type { Item } from "@/lib/model";
import { frequencies, nextDay } from "@/lib/schedule";
const input = (iso: string, zone: string) =>
  iso
    ? Temporal.Instant.from(iso)
        .toZonedDateTimeISO(zone)
        .toPlainDateTime()
        .toString()
        .slice(0, 16)
    : "";
const instant = (text: string, zone: string) =>
  text
    ? Temporal.PlainDateTime.from(text)
        .toZonedDateTime(zone, { disambiguation: "later" })
        .toInstant()
        .toString()
    : "";
export default function EventFields({
  item,
  onChange,
}: {
  item: Item;
  onChange: (item: Item) => void;
}) {
  const event = item.kind === "event",
    change = (patch: Partial<Item>) => onChange({ ...item, ...patch });
  return (
    <>
      {event && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={item.busy}
            onChange={(e) => change({ busy: e.target.checked })}
          />
          Deze afspraak houdt tijd bezet
        </label>
      )}
      {event && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={item.all_day}
            onChange={(e) => {
              const day =
                item.start_date ||
                input(item.due_at, item.timezone).slice(0, 10) ||
                new Date().toLocaleDateString("sv-SE");
              change({
                all_day: e.target.checked,
                start_date: day,
                end_date: item.end_date || nextDay(day),
                ...(e.target.checked && item.schedule_kind === "hourly"
                  ? { schedule_kind: "none" as const }
                  : {}),
              });
            }}
          />
          Hele dag
        </label>
      )}
      {event && item.all_day ? (
        <div className="form-grid">
          <label>
            Eerste dag
            <input
              type="date"
              required
              value={item.start_date}
              onChange={(e) => {
                const day = e.target.value;
                change({
                  start_date: day,
                  ...(day && (!item.end_date || item.end_date <= day)
                    ? { end_date: nextDay(day) }
                    : {}),
                });
              }}
            />
          </label>
          <label>
            Laatste dag (inbegrepen)
            <input
              type="date"
              required
              value={item.end_date ? nextDay(item.end_date, -1) : ""}
              min={item.start_date}
              onChange={(e) =>
                change({
                  end_date: e.target.value ? nextDay(e.target.value) : "",
                })
              }
            />
          </label>
        </div>
      ) : (
        <div className="form-grid">
          <label>
            {item.kind === "task" ? "Streefdatum" : "Begintijd"}
            <input
              type="datetime-local"
              required={item.kind !== "task"}
              value={input(item.due_at, item.timezone)}
              onChange={(e) =>
                change({ due_at: instant(e.target.value, item.timezone) })
              }
            />
          </label>
          {event && (
            <label>
              Eindtijd
              <input
                type="datetime-local"
                value={input(item.end_at, item.timezone)}
                onChange={(e) =>
                  change({ end_at: instant(e.target.value, item.timezone) })
                }
              />
            </label>
          )}
        </div>
      )}
      <label>
        {event ? "Herhalen op de agenda" : "Herhalen na afronden"}
        <select
          value={event ? item.schedule_kind : item.repeat_kind}
          disabled={!!item.integration_id}
          onChange={(e) =>
            change(
              event
                ? { schedule_kind: e.target.value as Item["schedule_kind"] }
                : { repeat_kind: e.target.value as Item["repeat_kind"] },
            )
          }
        >
          {Object.entries(frequencies)
            .filter(([key]) => !item.all_day || key !== "hourly")
            .map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
        </select>
      </label>
      {event && item.schedule_kind !== "none" ? (
        <>
          <p className="hint">
            Vaste agendareeks, onafhankelijk van afronden. Maandultimo en 29
            februari schuiven naar de laatste geldige dag; het oorspronkelijke
            anker blijft behouden.
          </p>
          <div className="form-grid">
            <label>
              Herhalen tot en met (optioneel)
              <input
                type="date"
                disabled={!!item.integration_id}
                value={item.schedule_until}
                onChange={(e) => change({ schedule_until: e.target.value })}
              />
            </label>
            <label>
              Aantal momenten (optioneel)
              <input
                type="number"
                min={1}
                max={1000000}
                disabled={!!item.integration_id}
                value={item.schedule_count ?? ""}
                onChange={(e) =>
                  change({
                    schedule_count: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </label>
          </div>
        </>
      ) : (
        !event && (
          <p className="hint">
            Na afronden verschijnt één volgende taak of herinnering. Gemiste
            momenten worden overgeslagen; checkliststappen beginnen opnieuw.
            Heropenen verwijdert de volgende taak niet. Stop de routine met Niet
            herhalen op de volgende taak.
          </p>
        )
      )}
      <p className="hint">
        Datum en tijd in {item.timezone}. Bij een dubbele of ontbrekende
        kloktijd geldt de latere interpretatie.
      </p>
    </>
  );
}
