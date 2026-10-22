"use client";
import { useState } from "react";
import type { Item } from "@/lib/model";
import { dayKey, monthDays, occursOn } from "@/lib/calendar";
export default function MonthCalendar({
  items,
  selected,
  onSelect,
}: {
  items: Item[];
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  const [month, setMonth] = useState(() => new Date());
  const label = month.toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
  const today = dayKey(new Date());
  return (
    <section className="panel month-calendar" aria-label="Maandkalender">
      <div className="month-header">
        <h2 aria-live="polite">{label}</h2>
        <div>
          <button
            className="secondary"
            aria-label="Vorige maand"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            ←
          </button>
          <button
            className="text-button"
            onClick={() => {
              setMonth(new Date());
              onSelect(today);
            }}
          >
            Vandaag
          </button>
          <button
            className="secondary"
            aria-label="Volgende maand"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            →
          </button>
        </div>
      </div>
      <div className="month-grid" role="group" aria-label="Kies een dag">
        {["ma", "di", "wo", "do", "vr", "za", "zo"].map((day) => (
          <span className="weekday" key={day}>
            {day}
          </span>
        ))}
        {monthDays(month).map((date) => {
          const key = dayKey(date);
          const events = items.filter(
            (i) => i.kind === "event" && occursOn(i, key),
          );
          return (
            <button
              key={key}
              className={
                "month-day" +
                (date.getMonth() !== month.getMonth() ? " other-month" : "") +
                (key === today ? " is-today" : "") +
                (key === selected ? " is-selected" : "")
              }
              aria-pressed={key === selected}
              aria-current={key === today ? "date" : undefined}
              aria-label={`${date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${events.length} afspraken`}
              onClick={() => {
                setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                onSelect(key);
              }}
            >
              <span>{date.getDate()}</span>
              {events.length > 0 && (
                <small>
                  {events.length}
                  <span className="calendar-event-word">
                    {" "}
                    {events.length === 1 ? "afspraak" : "afspraken"}
                  </span>
                </small>
              )}
            </button>
          );
        })}
      </div>
      <div className="month-footer">
        <p>
          {selected
            ? `Afspraken op ${new Date(selected + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}`
            : "Kies een dag om afspraken te bekijken."}
        </p>
        <button className="text-button" onClick={() => onSelect(null)}>
          Alle datums
        </button>
      </div>
    </section>
  );
}
