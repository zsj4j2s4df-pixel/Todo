import { z } from "zod";
import { blankItem, itemSchema, type Item, type Member } from "./model";

export const noteSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().min(1),
  body: z.string().trim().min(1).max(5000),
  source_type: z.enum(["text", "voice", "gmail"]).default("text"),
  source_key: z.string().max(300).nullable().default(null),
  source_url: z.string().url().max(1000).nullable().default(null),
  state: z.enum(["inbox", "kept", "converted", "trash"]).default("inbox"),
  converted_item_id: z.string().uuid().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Note = z.infer<typeof noteSchema>;
export type ItemTemplate = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  checklist: Item["checklist"];
  list_type: Item["list_type"];
  created_at: string;
};
export function noteDraft(
  user: string,
  body: string,
  source: Note["source_type"] = "text",
): Note {
  return noteSchema.parse({
    id: crypto.randomUUID(),
    user_id: user,
    body,
    source_type: source,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}
export function assigneeLabel(
  item: Item,
  user: string,
  members: Member[],
): string {
  const ids = [...new Set(item.assignees)];
  const name = (id: string) =>
    id === user
      ? "jou"
      : members.find((m) => m.user_id === id)?.display_name ||
        "een toegewezen persoon";
  if (!ids.length) return "Nog niet toegewezen";
  if (ids.length === 1) return `Voor ${name(ids[0])}`;
  if (ids.length === 2 && ids.includes(user))
    return `Voor jullie beiden · ${ids.map(name).join(" en ")}`;
  return `Voor ${ids.map(name).join(", ")}`;
}
export function instantiateTemplate(
  template: ItemTemplate,
  user: string,
  household: string | null,
): Item {
  return itemSchema.parse({
    ...blankItem(user, household),
    title: template.name,
    description: template.description,
    list_type: template.list_type,
    checklist: template.checklist.map((s) => ({
      id: crypto.randomUUID(),
      text: s.text,
      done: false,
    })),
  });
}
export function templateFromItem(item: Item, user: string): ItemTemplate {
  return {
    id: crypto.randomUUID(),
    user_id: user,
    name: item.title,
    description: item.description,
    list_type: item.list_type,
    checklist: item.checklist.map((s) => ({ ...s, done: false })),
    created_at: new Date().toISOString(),
  };
}
export function restorePrivately(item: Item): Item {
  return {
    ...item,
    deleted_at: null,
    visibility: "private",
    assignees: [],
    selected_users: [],
    updated_at: new Date().toISOString(),
  };
}
