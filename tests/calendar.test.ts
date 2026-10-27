import { expect, it } from "vitest";
import { calendarExport } from "../lib/calendar";
import { blankItem } from "../lib/model";
import ICAL from "ical.js";
it("exports wall-clock series across DST and preserves month-end clamping", () => {
  const text = calendarExport([
    {
      ...blankItem("device", null, "event"),
      title: "Maandultimo",
      timezone: "Europe/Amsterdam",
      due_at: "2027-01-31T08:00:00Z",
      schedule_kind: "monthly",
    },
  ]);
  expect(text).toContain("DTSTART;TZID=Europe/Amsterdam:20270131T090000");
  expect(text.replaceAll("\r\n ", "")).toContain(
    "BYMONTHDAY=28,29,30,31;BYSETPOS=-1",
  );
  const calendar = new ICAL.Component(ICAL.parse(text)),
    component = calendar.getFirstSubcomponent("vtimezone")!;
  const zone = new ICAL.Timezone({ component, tzid: "Europe/Amsterdam" });
  for (const [date, expected] of [
    ["2027-03-27T09:00:00", "2027-03-27T08:00:00.000Z"],
    ["2027-03-28T09:00:00", "2027-03-28T07:00:00.000Z"],
    ["2027-10-31T09:00:00", "2027-10-31T08:00:00.000Z"],
  ]) {
    const time = ICAL.Time.fromString(date, null);
    time.zone = zone;
    expect(time.toJSDate().toISOString()).toBe(expected);
  }
});
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

import { dayKey, monthDays, occursOn } from "../lib/calendar";
it("lays out six Monday-first weeks across month and year boundaries", () => {
  const days = monthDays(new Date(2027, 0, 1));
  expect(days).toHaveLength(42);
  expect(days[0].getDay()).toBe(1);
  expect(dayKey(days[0])).toBe("2026-12-28");
  expect(dayKey(days[41])).toBe("2027-02-07");
});
it("shows overnight events on both days and treats midnight end as exclusive", () => {
  const event = {
    ...blankItem("device", null, "event"),
    title: "Nacht",
    due_at: new Date(2026, 9, 30, 23).toISOString(),
    end_at: new Date(2026, 9, 31, 1).toISOString(),
  };
  expect(occursOn(event, "2026-10-30")).toBe(true);
  expect(occursOn(event, "2026-10-31")).toBe(true);
  expect(
    occursOn(
      { ...event, end_at: new Date(2026, 9, 31, 0).toISOString() },
      "2026-10-31",
    ),
  ).toBe(false);
  expect(occursOn({ ...event, end_at: "" }, "2026-10-30")).toBe(true);
});
