export type WeatherMoment = {
  time: string;
  temperature: number;
  rain: number;
  wind: number;
};
export type WeatherReport = {
  moments: WeatherMoment[];
  day: { min: number; max: number; rain: number; wind: number };
  date: string;
};
export type WeatherLocation = {
  latitude: number;
  longitude: number;
  timezone: string;
  weather_time: string;
  weather_later_time: string;
};
export function forecastMoments(
  data: unknown,
  times: string[],
  day: string,
): WeatherMoment[] {
  if (!data || typeof data !== "object") return [];
  const h = (data as { hourly?: Record<string, unknown> }).hourly;
  if (!h || !Array.isArray(h.time)) return [];
  return [...new Set(times)].flatMap((time) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return [];
    const index = (h.time as unknown[]).indexOf(
      day + "T" + time.slice(0, 2) + ":00",
    );
    const get = (k: string) =>
      Array.isArray(h[k]) ? (h[k] as unknown[])[index] : null;
    const t = get("temperature_2m"),
      r = get("precipitation_probability"),
      w = get("wind_speed_10m");
    if (
      index < 0 ||
      typeof t !== "number" ||
      !Number.isFinite(t) ||
      t < -90 ||
      t > 65 ||
      typeof r !== "number" ||
      !Number.isFinite(r) ||
      r < 0 ||
      r > 100 ||
      typeof w !== "number" ||
      !Number.isFinite(w) ||
      w < 0 ||
      w > 400
    )
      return [];
    return [
      {
        time,
        temperature: Math.round(t),
        rain: Math.round(r),
        wind: Math.round(w),
      },
    ];
  });
}
export async function fetchWeather(
  location: WeatherLocation,
  signal: AbortSignal,
  now = new Date(),
): Promise<WeatherReport> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: "temperature_2m,precipitation_probability,wind_speed_10m",
    timezone: location.timezone,
    forecast_days: "2",
  }).toString();
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw Error("Weer tijdelijk niet beschikbaar.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: location.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  const data = await response.json();
  const moments = forecastMoments(
    data,
    [location.weather_time, location.weather_later_time],
    day,
  );
  if (!moments.length) throw Error("Geen uurverwachting beschikbaar.");
  const all = forecastMoments(
    data,
    Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0") + ":00"),
    day,
  );
  return {
    moments,
    date: day,
    day: {
      min: Math.min(...all.map((m) => m.temperature)),
      max: Math.max(...all.map((m) => m.temperature)),
      rain: Math.max(...all.map((m) => m.rain)),
      wind: Math.max(...all.map((m) => m.wind)),
    },
  };
}
