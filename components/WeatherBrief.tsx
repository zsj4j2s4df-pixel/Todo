"use client";
import { useEffect, useState } from "react";
import { fetchWeather, WeatherReport } from "@/lib/weather";
import type { BriefPreferences } from "@/lib/brief-preferences";
export default function WeatherBrief({
  preferences: p,
}: {
  preferences: BriefPreferences;
}) {
  const [rides, setRides] = useState<WeatherReport | null>(null),
    [message, setMessage] = useState("Weer ophalen…"),
    [updated, setUpdated] = useState("");
  useEffect(() => {
    let stop = false;
    let controller: AbortController;
    async function refresh() {
      controller?.abort();
      controller = new AbortController();
      try {
        if (p.latitude === null || p.longitude === null) return;
        const r = await fetchWeather(
          { ...p, latitude: p.latitude, longitude: p.longitude },
          AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        );
        if (!stop) {
          setRides(r);
          setMessage("");
          setUpdated(
            new Date().toLocaleTimeString("nl-NL", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          );
        }
      } catch {
        if (!stop) {
          setRides(null);
          setMessage(
            "Het weer is tijdelijk niet beschikbaar. Bekijk Buienradar voor je vertrekt.",
          );
        }
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15 * 60 * 1000);
    return () => {
      stop = true;
      controller?.abort();
      clearInterval(timer);
    };
  }, [
    p.latitude,
    p.longitude,
    p.timezone,
    p.weather_time,
    p.weather_later_time,
  ]);
  return (
    <div className="weather-brief">
      <h3>Het weer · {p.place_name}</h3>
      {message && <p role="status">{message}</p>}
      {rides && (
        <p>
          <strong>
            Vandaag {rides.day.min} tot {rides.day.max} °C
          </strong>{" "}
          · hoogste regenkans {rides.day.rain}% · wind tot {rides.day.wind} km/u
        </p>
      )}
      {rides?.moments.map((r) => (
        <p key={r.time}>
          <strong>Rond {r.time}</strong> · {r.temperature} °C · regenkans{" "}
          {r.rain}% · wind {r.wind} km/u
        </p>
      ))}
      <p className="hint">
        Uurverwachting voor vandaag in {p.timezone}. Geen regenradar of
        drooggarantie.{updated && ` Opgehaald om ${updated}.`}{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Weerdata: Open-Meteo
        </a>{" "}
        ·{" "}
        <a
          href="https://www.buienradar.nl/nederland/neerslag/buienradar"
          target="_blank"
          rel="noreferrer"
        >
          Bekijk Buienradar
        </a>
      </p>
    </div>
  );
}
