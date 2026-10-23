import { test, expect } from "vitest";
import { previewCalendar } from "../lib/calendar-import";
import { blankItem } from "../lib/model";
const wrap = (events: string, extra = "") =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${extra}${events}\r\nEND:VCALENDAR\r\n`;
const event = (uid: string, start: string, extra = "") =>
  `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:Koffie\\, samen\r\n${start}\r\n${extra}END:VEVENT`;
test("UTC, floating, IANA, duration and all-day events import privately with exclusive end", async () => {
  const text = wrap(
    [
      event("one", "DTSTART:20261023T100000Z"),
      event("two", "DTSTART;TZID=Europe/Amsterdam:20261023T120000"),
      event(
        "three",
        "DTSTART:20261023T120000",
        "DURATION:PT1H\r\nATTENDEE:mailto:someone@example.com\r\n",
      ),
      event("four", "DTSTART;VALUE=DATE:20270328"),
    ].join("\r\n"),
  );
  const result = await previewCalendar(
    text,
    "device",
    null,
    "Europe/Amsterdam",
    [],
  );
  expect(result.items).toHaveLength(4);
  expect(result.items[0].title).toBe("Koffie, samen");
  expect(Date.parse(result.items[0].due_at)).toBe(
    Date.parse(result.items[1].due_at),
  );
  expect(
    Date.parse(result.items[2].end_at) - Date.parse(result.items[2].due_at),
  ).toBe(3600000);
  expect(
    Date.parse(result.items[3].end_at) - Date.parse(result.items[3].due_at),
  ).toBe(23 * 3600000);
  expect(
    result.items.every(
      (i) =>
        i.visibility === "private" &&
        i.assignees.length === 0 &&
        i.selected_users.length === 0,
    ),
  ).toBe(true);
});
test("repeat, cancellation, duplicate UID and invalid dates cannot silently create misleading entries", async () => {
  const text = wrap(
    [
      event("one", "DTSTART:20261023T100000Z"),
      event("one", "DTSTART:20261023T100000Z"),
      event("recurring", "DTSTART:20261023T100000Z", "RRULE:FREQ=WEEKLY\r\n"),
      event("cancel", "DTSTART:20261023T100000Z", "STATUS:CANCELLED\r\n"),
      event("bad", "DTSTART:20261340T100000Z"),
    ].join("\r\n"),
  );
  const r = await previewCalendar(text, "device", null, "Europe/Amsterdam", []);
  expect(r.items).toHaveLength(1);
  expect(r.duplicates).toBe(1);
  expect(r.skipped).toHaveLength(3);
  const twice = await previewCalendar(
    text,
    "device",
    null,
    "Europe/Amsterdam",
    r.items,
  );
  expect(twice.items).toHaveLength(0);
  const existing = {
    ...blankItem("device", null, "event"),
    title: "Original",
    due_at: "2026-10-23T10:00:00Z",
  };
  expect(
    (
      await previewCalendar(
        wrap(event(existing.id + "@todo", "DTSTART:20261023T100000Z")),
        "device",
        null,
        "Europe/Amsterdam",
        [existing],
      )
    ).duplicates,
  ).toBe(1);
});
test("unknown or excessive calendars and hostile timezone recurrence are rejected", async () => {
  await expect(
    previewCalendar("x".repeat(200001), "device", null, "UTC", []),
  ).rejects.toThrow("groot");
  await expect(
    previewCalendar(
      wrap(
        Array.from({ length: 101 }, (_, i) =>
          event(String(i), "DTSTART:20261023T100000Z"),
        ).join("\r\n"),
      ),
      "device",
      null,
      "UTC",
      [],
    ),
  ).rejects.toThrow("100");
  const timezone =
    "BEGIN:VTIMEZONE\r\nTZID:Custom\r\nBEGIN:STANDARD\r\nDTSTART:20000101T000000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0100\r\nRRULE:FREQ=SECONDLY\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n";
  await expect(
    previewCalendar(
      wrap(event("one", "DTSTART;TZID=Custom:20261023T100000"), timezone),
      "device",
      null,
      "UTC",
      [],
    ),
  ).rejects.toThrow("complex");
});
