import { z } from "zod";
import { itemSchema, type Item } from "./model";
import { noteSchema, type Note, type ItemTemplate } from "./workspace";
const templateSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  checklist: itemSchema.shape.checklist,
  list_type: itemSchema.shape.list_type,
  created_at: z.string(),
});
export function localBackup(raw: unknown): {
  items: Item[];
  notes: Note[] | null;
  templates: ItemTemplate[] | null;
} {
  const data = Array.isArray(raw)
    ? { items: raw }
    : z
        .object({
          version: z.literal(2),
          items: z.array(z.unknown()).max(5000),
          notes: z.array(z.unknown()).max(5000),
          templates: z.array(z.unknown()).max(1000),
        })
        .parse(raw);
  if (data.items.length > 5000) throw Error("Te veel items in back-up.");
  const items = data.items.map((value) =>
    itemSchema.parse({
      ...(value as object),
      owner_id: "device",
      household_id: null,
      visibility: "private",
      assignees: [],
      selected_users: [],
      integration_id: null,
      source_calendar_id: null,
      source_event_id: null,
      source_version: null,
      source_hidden: false,
      source_deleted: false,
    }),
  );
  const notes =
    "notes" in data
      ? (data.notes as unknown[]).map((value) =>
          noteSchema.parse({ ...(value as object), user_id: "device" }),
        )
      : null;
  const templates =
    "templates" in data
      ? (data.templates as unknown[]).map((value) =>
          templateSchema.parse({ ...(value as object), user_id: "device" }),
        )
      : null;
  for (const rows of [items, notes || [], templates || []])
    if (new Set(rows.map((x) => x.id)).size !== rows.length)
      throw Error("Dubbele items in back-up.");
  return { items, notes, templates };
}
