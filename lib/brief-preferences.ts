import { z } from "zod";
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Kies een geldige tijd.");
export const briefSchema = z
  .object({
    delivery_time: time,
    tasks_enabled: z.boolean(),
    events_enabled: z.boolean(),
    clashes_enabled: z.boolean(),
    weather_enabled: z.boolean(),
    notes_enabled:z.boolean().default(true),review_enabled:z.boolean().default(true),
    place_name: z.string().max(120),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    weather_time: time,
    weather_later_time: time,
    timezone: z.string().min(1).max(80),
  })
  .refine(
    (p) =>
      !p.weather_enabled ||
      (p.latitude !== null &&
        p.longitude !== null &&
        p.place_name.trim().length > 0),
    "Kies eerst een weerplaats.",
  );
export type BriefPreferences = z.infer<typeof briefSchema>;
export const briefDefaults: BriefPreferences = {
  delivery_time: "08:00",
  tasks_enabled: true,
  events_enabled: true,
  clashes_enabled: true,
  weather_enabled: false,
  notes_enabled:true,review_enabled:true,
  place_name: "",
  latitude: null,
  longitude: null,
  weather_time: "08:30",
  weather_later_time: "17:30",
  timezone: "Europe/Amsterdam",
};
export function normalizeBrief(
  value: Partial<BriefPreferences>,
): BriefPreferences {
  return briefSchema.parse({
    ...briefDefaults,
    ...value,
    delivery_time:
      value.delivery_time?.slice(0, 5) || briefDefaults.delivery_time,
    weather_time: value.weather_time?.slice(0, 5) || briefDefaults.weather_time,
    weather_later_time:
      value.weather_later_time?.slice(0, 5) || briefDefaults.weather_later_time,
  });
}
