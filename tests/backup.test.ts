import { test, expect } from "vitest";
import { localBackup } from "../lib/backup";
import { blankItem } from "../lib/model";
import { noteDraft, templateFromItem } from "../lib/workspace";
test("versioned backup restores notes and templates while removing all external and shared authority", () => {
  const item = {
    ...blankItem("original", null),
    title: "Koffie",
    integration_id: crypto.randomUUID(),
    source_event_id: "provider",
  };
  const restored = localBackup({
    version: 2,
    items: [item],
    notes: [noteDraft("original", "Idee")],
    templates: [templateFromItem(item, "original")],
  });
  expect(restored.items[0]).toMatchObject({
    owner_id: "device",
    visibility: "private",
    integration_id: null,
    assignees: [],
  });
  expect(restored.notes?.[0].body).toBe("Idee");
  expect(restored.templates?.[0].user_id).toBe("device");
  expect(localBackup([item]).notes).toBeNull();
  expect(() => localBackup([item, item])).toThrow(/Dubbele/);
  expect(() =>
    localBackup({
      version: 2,
      items: [],
      notes: [{ body: "invalid" }],
      templates: [],
    }),
  ).toThrow();
});
