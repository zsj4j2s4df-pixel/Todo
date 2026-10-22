import { expect, it } from "vitest";
import { calendarExport } from "../lib/calendar";
import { blankItem } from "../lib/model";
it("exports appointments in UTC, keeping stable identifiers and excluding tasks", () => {
  const event = {
    ...blankItem("device", null, "event"),
    title: "Tandarts",
    due_at: "2026-10-30T17:00:00+01:00",
  };
  const text = calendarExport([event, blankItem("device", null)]);
  expect(text).toContain("DTSTART:20261030T160000Z");
  expect(text).toContain(`UID:${event.id}@todo`);
  expect(text).toContain("CLASS:PRIVATE");
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
});
it("escapes content to prevent calendar property injection and folds UTF-8 safely", () => {
  const text = calendarExport([
    {
      ...blankItem("device", null, "event"),
      title: "é".repeat(120) + "\nATTENDEE:other@example.com",
      description: "a,b;c\\d",
      due_at: "2026-10-30T17:00:00Z",
    },
  ]);
  expect(text).not.toContain("\r\nATTENDEE:");
  expect(text).toContain("DESCRIPTION:a\\,b\\;c\\\\d");
  for (const line of text.split("\r\n"))
    expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  expect(text.replace(/\r\n /g, "")).toContain(
    "é".repeat(120) + "\\nATTENDEE:other@example.com",
  );
});
