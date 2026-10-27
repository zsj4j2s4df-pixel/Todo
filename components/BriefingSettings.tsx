"use client";
import { useEffect, useState } from "react";
import type { BriefPreferences } from "@/lib/brief-preferences";
type Place = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};
export default function BriefingSettings({
  value,
  onSave,
  busy,
}: {
  value: BriefPreferences;
  onSave: (p: BriefPreferences) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(value),
    [query, setQuery] = useState(""),
    [places, setPlaces] = useState<Place[]>([]),
    [message, setMessage] = useState(""),
    [searching, setSearching] = useState(false);
  useEffect(() => setDraft(value), [value]);
  async function search() {
    setSearching(true);
    setMessage("");
    setPlaces([]);
    try {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.search = new URLSearchParams({
        name: query.trim().slice(0, 80),
        count: "5",
        language: "nl",
        format: "json",
      }).toString();
      const r = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!r.ok) throw Error();
      const data = await r.json();
      const list = (Array.isArray(data.results) ? data.results : []).filter(
        (p: Place) =>
          typeof p.name === "string" &&
          Number.isFinite(p.latitude) &&
          Number.isFinite(p.longitude),
      );
      setPlaces(list);
      if (!list.length)
        setMessage(
          "Geen plaats gevonden. Probeer een grotere plaats in de buurt.",
        );
    } catch {
      setMessage(
        "Plaatsen zoeken is tijdelijk niet beschikbaar. Probeer opnieuw.",
      );
    } finally {
      setSearching(false);
    }
  }
  return (
    <section className="brief-settings" aria-label="Dagbriefing instellen">
      <h3>Jouw dagbriefing</h3>
      <label>
        Tijd van je ochtendseintje
        <input
          type="time"
          required
          value={draft.delivery_time}
          onChange={(e) =>
            setDraft({ ...draft, delivery_time: e.target.value })
          }
        />
      </label>
      <p className="hint">
        In {draft.timezone}. Het seintje vereist push op dit apparaat en kan
        door je apparaat later worden getoond.
      </p>
      {(
        [
          ["notes_enabled", "Onverwerkte notities"],
          ["review_enabled", "Wekelijkse opruimronde"],
          ["tasks_enabled", "Taken en volgende stappen"],
          ["events_enabled", "Afspraken"],
          ["clashes_enabled", "Overlappende afspraken"],
          ["weather_enabled", "Weer bij mijn dag"],
        ] as const
      ).map(([key, label]) => (
        <label className="check-label" key={key}>
          <input
            type="checkbox"
            checked={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      {draft.weather_enabled && (
        <>
          <label>
            Weerplaats zoeken
            <input
              value={query}
              maxLength={80}
              placeholder="Bijvoorbeeld Utrecht"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            type="button"
            disabled={searching || query.trim().length < 3}
            onClick={() => void search()}
          >
            Plaats zoeken
          </button>
          {places.length > 0 && (
            <ul className="place-results">
              {places.map((p, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setDraft({
                        ...draft,
                        place_name:
                          `${p.name}${p.country ? ", " + p.country : ""}`.slice(
                            0,
                            120,
                          ),
                        latitude: p.latitude,
                        longitude: p.longitude,
                      });
                      setPlaces([]);
                      setMessage(
                        "Plaats gekozen. Bewaar je briefing om dit toe te passen.",
                      );
                    }}
                  >
                    {p.name}, {p.admin1} {p.country}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p>Gekozen: {draft.place_name || "nog geen plaats"}</p>
          <div className="form-grid">
            <label>
              Eerste weermoment
              <input
                type="time"
                value={draft.weather_time}
                onChange={(e) =>
                  setDraft({ ...draft, weather_time: e.target.value })
                }
              />
            </label>
            <label>
              Tweede weermoment
              <input
                type="time"
                value={draft.weather_later_time}
                onChange={(e) =>
                  setDraft({ ...draft, weather_later_time: e.target.value })
                }
              />
            </label>
          </div>
          <p className="hint">
            Alleen je gekozen plaats gaat naar Open-Meteo voor
            weersverwachtingen. Geen exacte GPS of privéagenda. Bij een
            ochtendpush met weer haalt de server de verwachting voor deze plaats
            op. Uitzetten stopt nieuwe weerverzoeken. Buienradar opent als
            aparte radarwebsite.
          </p>
        </>
      )}
      <button
        className="secondary"
        type="button"
        disabled={busy}
        onClick={() => onSave(draft)}
      >
        Briefing bewaren
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
