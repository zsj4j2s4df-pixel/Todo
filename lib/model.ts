import { z } from "zod";
export const itemSchema = z
  .object({
    id: z.string().uuid(),
    owner_id: z.string().min(1),
    household_id: z.string().uuid().nullable(),
    kind: z.enum(["task", "event", "reminder"]),
    title: z.string().trim().min(1, "Vul een titel in.").max(200),
    description: z.string().max(5000),
    deleted_at: z.string().nullable().default(null),
    reviewed_at: z.string().nullable().default(null),
    integration_id: z.string().uuid().nullable().default(null),
    source_calendar_id: z.string().nullable().default(null),
    source_event_id: z.string().nullable().default(null),
    source_version: z.string().nullable().default(null),
    source_hidden: z.boolean().default(false),
    source_deleted: z.boolean().default(false),
    list_type: z.enum(["none", "shopping"]).default("none"),
    event_type: z
      .enum(["standard", "birthday", "vacation"])
      .default("standard"),
    all_day: z.boolean().default(false),
    busy: z.boolean().default(true),
    start_date: z.string().default(""),
    end_date: z.string().default(""),
    schedule_kind: z
      .enum([
        "none",
        "hourly",
        "daily",
        "weekly",
        "fortnightly",
        "monthly",
        "yearly",
      ])
      .default("none"),
    schedule_until: z.string().default(""),
    schedule_count: z
      .number()
      .int()
      .min(1)
      .max(1000000)
      .nullable()
      .default(null),
    schedule_exceptions: z
      .array(
        z.object({
          index: z.number().int().min(0).max(1000000),
          cancelled: z.boolean(),
          patch: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .max(200)
      .default([]),
    checklist: z
      .array(
        z.object({
          id: z.string().uuid(),
          text: z.string().trim().min(1, "Vul een stap in.").max(200),
          done: z.boolean(),
        }),
      )
      .max(50)
      .default([]),
    import_uid: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable()
      .default(null),
    repeat_kind: z
      .enum([
        "none",
        "hourly",
        "daily",
        "weekly",
        "fortnightly",
        "monthly",
        "yearly",
      ])
      .default("none"),
    repeat_anchor: z.string().nullable().default(null),
    repeat_index: z.number().int().min(0).max(1000000).default(0),
    repeat_source: z.string().uuid().nullable().default(null),
    status: z.enum(["open", "done"]),
    priority: z.enum(["low", "normal", "high"]),
    category: z.string().max(80),
    due_at: z.string(),
    end_at: z.string(),
    timezone: z.string(),
    location: z.string().max(500),
    visibility: z.enum(["private", "shared", "selected"]),
    assignees: z.array(z.string().uuid()),
    selected_users: z.array(z.string().uuid()),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .superRefine((v, ctx) => {
    try {
      new Intl.DateTimeFormat("nl", { timeZone: v.timezone });
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["timezone"],
        message: "Kies een geldige tijdzone.",
      });
    }
    for (const key of ["start_date", "end_date", "schedule_until"] as const) {
      const day = v[key];
      if (
        day &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
          !Number.isFinite(Date.parse(day + "T00:00:00Z")) ||
          new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day)
      )
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Kies een geldige datum.",
        });
    }

    if (v.repeat_kind !== "none") {
      if (!v.due_at || v.kind === "event")
        ctx.addIssue({
          code: "custom",
          path: ["repeat_kind"],
          message: "Herhalen kan bij taken en herinneringen met een datum.",
        });
      try {
        new Intl.DateTimeFormat("nl", { timeZone: v.timezone });
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["timezone"],
          message: "Kies een geldige tijdzone.",
        });
      }
    }

    if (v.kind !== "task" && !v.due_at && !v.all_day)
      ctx.addIssue({
        code: "custom",
        path: ["due_at"],
        message: "Kies een datum en tijd.",
      });
    if (v.schedule_count && v.schedule_until)
      ctx.addIssue({
        code: "custom",
        path: ["schedule_until"],
        message: "Kies een einddatum óf een aantal herhalingen.",
      });
    if (v.all_day) {
      if (
        v.kind !== "event" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v.start_date) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v.end_date) ||
        v.end_date <= v.start_date
      )
        ctx.addIssue({
          code: "custom",
          path: ["start_date"],
          message: "Kies een geldige hele dag of periode.",
        });
    }
    if (
      v.schedule_kind !== "none" &&
      (v.kind !== "event" || (v.all_day && v.schedule_kind === "hourly"))
    )
      ctx.addIssue({
        code: "custom",
        path: ["schedule_kind"],
        message: "Kies een passende herhaling voor deze afspraak.",
      });
    for (const key of ["due_at", "end_at"] as const)
      if (v[key] && Number.isNaN(Date.parse(v[key])))
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Ongeldige datum.",
        });
    if (v.end_at && !v.due_at)
      ctx.addIssue({
        code: "custom",
        path: ["end_at"],
        message: "Kies eerst een begintijd.",
      });
    if (v.end_at && v.due_at && Date.parse(v.end_at) < Date.parse(v.due_at))
      ctx.addIssue({
        code: "custom",
        path: ["end_at"],
        message: "De eindtijd moet na de begintijd liggen.",
      });
    if (v.visibility !== "private" && !v.household_id)
      ctx.addIssue({
        code: "custom",
        path: ["visibility"],
        message: "Koppel eerst een huishouden.",
      });
    if (v.visibility === "selected" && !v.selected_users.length)
      ctx.addIssue({
        code: "custom",
        path: ["selected_users"],
        message: "Selecteer minstens één persoon.",
      });
    if (
      v.visibility === "private" &&
      v.assignees.some((id) => id !== v.owner_id)
    )
      ctx.addIssue({
        code: "custom",
        path: ["assignees"],
        message: "Deel de taak voordat je iemand anders toewijst.",
      });
    if (
      v.visibility === "selected" &&
      v.assignees.some(
        (id) => id !== v.owner_id && !v.selected_users.includes(id),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["assignees"],
        message: "Iedere toegewezen persoon moet toegang krijgen.",
      });
  });
export type Item = z.infer<typeof itemSchema>;
export type Member = { user_id: string; display_name: string };
/** PostgreSQL dates use null; forms use empty strings. Keep one conversion boundary. */
export function readItem(row: Record<string, unknown>): Item {
  return itemSchema.parse({
    ...row,
    due_at: row.due_at || "",
    end_at: row.end_at || "",
    start_date: row.start_date || "",
    end_date: row.end_date || "",
    schedule_until: row.schedule_until || "",
  });
}
export function itemForDatabase(
  item: Item,
  update = false,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    ...item,
    due_at: item.due_at || null,
    end_at: item.end_at || null,
    start_date: item.start_date || null,
    end_date: item.end_date || null,
    schedule_until: item.schedule_until || null,
  };
  for (const key of [
    "deleted_at",
    "integration_id",
    "source_calendar_id",
    "source_event_id",
    "source_version",
    "source_hidden",
    "source_deleted",
  ])
    delete result[key];
  if (update) delete result.schedule_exceptions;
  return result;
}
export function prepareRepeat(item: Item, previous?: Item): Item {
  if (item.repeat_kind === "none")
    return { ...item, repeat_anchor: null, repeat_index: 0 };
  if (
    previous &&
    previous.due_at === item.due_at &&
    previous.repeat_kind === item.repeat_kind &&
    previous.timezone === item.timezone
  )
    return {
      ...item,
      repeat_anchor: previous.repeat_anchor || previous.due_at,
      repeat_index: previous.repeat_index,
    };
  return { ...item, repeat_anchor: item.due_at, repeat_index: 0 };
}
export function blankItem(
  owner_id: string,
  household_id: string | null,
  kind: Item["kind"] = "task",
): Item {
  return {
    id: crypto.randomUUID(),
    owner_id,
    household_id,
    kind,
    title: "",
    description: "",
    deleted_at: null,
    reviewed_at: null,
    integration_id: null,
    source_calendar_id: null,
    source_event_id: null,
    source_version: null,
    source_hidden: false,
    source_deleted: false,
    list_type: "none",
    event_type: "standard",
    all_day: false,
    busy: true,
    start_date: "",
    end_date: "",
    schedule_kind: "none",
    schedule_until: "",
    schedule_count: null,
    schedule_exceptions: [],
    checklist: [],
    import_uid: null,
    repeat_kind: "none",
    repeat_anchor: null,
    repeat_index: 0,
    repeat_source: null,
    status: "open",
    priority: "normal",
    category: "",
    due_at: "",
    end_at: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    location: "",
    visibility: "private",
    assignees: [],
    selected_users: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
export function parseCapture(text: string) {
  const matches = [
    ...text.matchAll(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{4}))?\b/g),
  ];
  const times = [...text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)];
  const time = times.length === 1 ? times[0] : null;
  let due = "";
  let warning = "Controleer de tekst en kies zelf de datum en tijd.";
  if (matches.length === 1 && matches[0][3] && time) {
    const [, day, month, year] = matches[0];
    const d = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(time[1]),
      Number(time[2]),
    );
    if (
      d.getFullYear() === Number(year) &&
      d.getDate() === Number(day) &&
      d.getMonth() === Number(month) - 1 &&
      d.getHours() === Number(time[1]) &&
      d.getMinutes() === Number(time[2])
    ) {
      due = d.toISOString();
      warning = "Datum herkend. Controleer het concept voordat je opslaat.";
    }
  }
  return { title: text.trim().slice(0, 200), due, warning };
}
export function localDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function mapLink(location: string, provider: string) {
  return provider === "apple"
    ? `https://maps.apple.com/?q=${encodeURIComponent(location)}`
    : provider === "waze"
      ? `https://www.waze.com/ul?q=${encodeURIComponent(location)}&navigate=yes`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
