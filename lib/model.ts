import { z } from "zod";
export const itemSchema = z
  .object({
    id: z.string().uuid(),
    owner_id: z.string().min(1),
    household_id: z.string().uuid().nullable(),
    kind: z.enum(["task", "event", "reminder"]),
    title: z.string().trim().min(1, "Vul een titel in.").max(200),
    description: z.string().max(5000),
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
    if (v.kind !== "task" && !v.due_at)
      ctx.addIssue({
        code: "custom",
        path: ["due_at"],
        message: "Kies een datum en tijd.",
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
    checklist: [],
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
