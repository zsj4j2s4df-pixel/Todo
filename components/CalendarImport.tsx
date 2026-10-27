"use client";
import { useEffect, useRef, useState } from "react";
import type { Item } from "@/lib/model";
import type { CalendarPreview } from "@/lib/calendar-import";
export default function CalendarImport({
  user,
  household,
  existing,
  busy,
  onImport,
}: {
  user: string;
  household: string | null;
  existing: Item[];
  busy: boolean;
  onImport: (items: Item[]) => Promise<number>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [zone, setZone] = useState("Europe/Amsterdam"),
    [preview, setPreview] = useState<CalendarPreview | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [working, setWorking] = useState(false),
    [message, setMessage] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    return () => {
      alive.current = false;
    };
  }, []);
  async function parse(input: File) {
    setWorking(true);
    setPreview(null);
    setMessage("");
    try {
      if (input.size > 200000)
        throw Error("Agendabestand is te groot (maximaal 200 kB).");
      const { previewCalendar } = await import("@/lib/calendar-import");
      const result = await previewCalendar(
        await input.text(),
        user,
        household,
        zone,
        existing,
      );
      if (!alive.current) return;
      setPreview(result);
      setSelected(result.items.map((i) => i.id));
      if (!result.items.length)
        setMessage(
          "Geen nieuwe losse afspraken om te importeren. Bekijk de eventuele redenen hieronder.",
        );
    } catch (e) {
      if (alive.current)
        setMessage(
          e instanceof Error ? e.message : "Voorbeeld maken is niet gelukt.",
        );
    } finally {
      if (alive.current) setWorking(false);
    }
  }
  async function save() {
    if (!preview) return;
    setWorking(true);
    setMessage("");
    try {
      const count = await onImport(
        preview.items.filter((i) => selected.includes(i.id)),
      );
      if (alive.current) {
        setPreview(null);
        setSelected([]);
        setMessage(
          `${count} ${count === 1 ? "afspraak" : "afspraken"} privé geïmporteerd. Bestaande afspraken zijn overgeslagen.`,
        );
      }
    } catch (e) {
      if (alive.current)
        setMessage(
          e instanceof Error ? e.message : "Importeren is niet gelukt.",
        );
    } finally {
      if (alive.current) setWorking(false);
    }
  }
  return (
    <section aria-label="Agenda importeren">
      <h3>Agenda importeren (.ics)</h3>
      <p>
        Neem losse afspraken uit Apple Agenda, Google Agenda of Outlook over. Je
        controleert eerst het voorbeeld; alle afspraken worden privé opgeslagen.
        Dit is een eenmalige import.
      </p>
      <label>
        Agendabestand kiezen
        <input
          type="file"
          accept=".ics,text/calendar"
          disabled={busy || working}
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            if (chosen) {
              setFile(chosen);
              void parse(chosen);
            }
            e.target.value = "";
          }}
        />
      </label>
      <label>
        Tijdzone voor afspraken zonder tijdzone
        <input
          value={zone}
          maxLength={80}
          disabled={busy || working}
          onChange={(e) => {
            setZone(e.target.value);
            setPreview(null);
            setSelected([]);
          }}
        />
      </label>
      {file && (
        <button
          className="secondary"
          disabled={busy || working}
          onClick={() => void parse(file)}
        >
          Voorbeeld opnieuw maken
        </button>
      )}
      {working && <p role="status">Even verwerken…</p>}
      {preview && (
        <>
          <p>
            {preview.items.length} nieuwe afspraken · {preview.duplicates} al
            aanwezig · {preview.skipped.length} overgeslagen.
          </p>
          {preview.items.map((i) => (
            <label className="check-label" key={i.id}>
              <input
                type="checkbox"
                checked={selected.includes(i.id)}
                disabled={busy || working}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, i.id]
                      : selected.filter((id) => id !== i.id),
                  )
                }
              />
              {i.title} · {new Date(i.due_at).toLocaleString("nl-NL")}{" "}
              {i.end_at && ` tot ${new Date(i.end_at).toLocaleString("nl-NL")}`}
            </label>
          ))}
          {preview.skipped.length > 0 && (
            <details>
              <summary>Waarom afspraken zijn overgeslagen</summary>
              <ul>
                {preview.skipped.map((s, n) => (
                  <li key={n}>
                    {s.title}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button
            className="secondary"
            disabled={busy || working || !selected.length}
            onClick={() => void save()}
          >
            Geselecteerde afspraken privé importeren
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
      <p className="hint">
        Maximaal 100 afspraken / 200 kB. Geen automatische synchronisatie of
        updates. Herhalingen en annuleringen worden gemeld en overgeslagen.
        Deelnemers, uitnodigingen en bijlagen worden niet overgenomen of
        verstuurd.
      </p>
    </section>
  );
}
