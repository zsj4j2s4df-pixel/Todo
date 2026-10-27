import { timezoneLines, localIcalStamp } from "./ical-zone";
import type { Item } from "./model";
import { eventInstances, occurrenceAt } from "./schedule";
const escape = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const stamp = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
function fold(line: string) {
  let result = "",
    segment = "",
    bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) {
      result += segment + "\r\n";
      segment = " ";
      bytes = 1;
    }
    segment += char;
    bytes += size;
  }
  return result + segment;
}
/** Export only records already authorized by the app; never fetch or infer other people's data. */
export function calendarExport(items: Item[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Todo//Huishoudagenda//NL",
    "CALSCALE:GREGORIAN",
  ];
  const zones = new Set<string>();
  for (const i of items.filter(
    (i) =>
      i.kind === "event" &&
      !i.deleted_at &&
      !i.all_day &&
      i.schedule_kind !== "none" &&
      i.schedule_kind !== "hourly",
  )) {
    if (!zones.has(i.timezone)) {
      lines.push(
        ...timezoneLines(i.timezone, new Date(i.due_at).getUTCFullYear()),
      );
      zones.add(i.timezone);
    }
  }
  for (const i of items.filter(
    (i) => i.kind === "event" && i.due_at && !i.deleted_at,
  )) {
    const wall =
      i.schedule_kind !== "none" && i.schedule_kind !== "hourly" && !i.all_day;
    const timed = (key: string, value: string) =>
      wall
        ? `${key};TZID=${i.timezone}:${localIcalStamp(value, i.timezone)}`
        : `${key}:${stamp(value)}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${i.id}@todo`,
      `DTSTAMP:${stamp(i.updated_at)}`,
      i.all_day
        ? `DTSTART;VALUE=DATE:${i.start_date.replaceAll("-", "")}`
        : timed("DTSTART", i.due_at),
    );
    if (i.end_at)
      lines.push(
        i.all_day
          ? `DTEND;VALUE=DATE:${i.end_date.replaceAll("-", "")}`
          : timed("DTEND", i.end_at),
      );
    if (i.schedule_kind && i.schedule_kind !== "none") {
      const freq =
        i.schedule_kind === "fortnightly"
          ? "WEEKLY;INTERVAL=2"
          : i.schedule_kind.toUpperCase();
      const anchor = new Date(i.due_at)
        .toLocaleDateString("sv-SE", { timeZone: i.timezone })
        .split("-")
        .map(Number);
      let clamp = "";
      if (i.schedule_kind === "monthly" && anchor[2] > 28)
        clamp = `;BYMONTHDAY=${Array.from({ length: anchor[2] - 27 }, (_, n) => 28 + n).join(",")};BYSETPOS=-1`;
      if (i.schedule_kind === "yearly" && anchor[1] === 2 && anchor[2] === 29)
        clamp = ";BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1";
      lines.push(
        `RRULE:FREQ=${freq}${clamp}${i.schedule_count ? `;COUNT=${i.schedule_count}` : ""}${i.schedule_until ? `;UNTIL=${i.schedule_until.replaceAll("-", "")}${i.all_day ? "" : "T235959Z"}` : ""}`,
      );
    }
    lines.push(
      `TRANSP:${i.busy === false ? "TRANSPARENT" : "OPAQUE"}`,
      `SUMMARY:${escape(i.title)}`,
      `DESCRIPTION:${escape(i.description)}`,
      `LOCATION:${escape(i.location)}`,
      `CLASS:${i.visibility === "private" ? "PRIVATE" : "CONFIDENTIAL"}`,
      "END:VEVENT",
    );
    for (const exception of i.schedule_exceptions || []) {
      const original = occurrenceAt(
          { ...i, schedule_exceptions: [] },
          exception.index,
        ),
        changed = occurrenceAt(i, exception.index);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${i.id}@todo`,
        `DTSTAMP:${stamp(i.updated_at)}`,
        i.all_day
          ? `RECURRENCE-ID;VALUE=DATE:${original.start_date.replaceAll("-", "")}`
          : timed("RECURRENCE-ID", original.due_at),
        changed.all_day
          ? `DTSTART;VALUE=DATE:${changed.start_date.replaceAll("-", "")}`
          : timed("DTSTART", changed.due_at),
      );
      if (changed.end_at)
        lines.push(
          changed.all_day
            ? `DTEND;VALUE=DATE:${changed.end_date.replaceAll("-", "")}`
            : timed("DTEND", changed.end_at),
        );
      if (exception.cancelled) lines.push("STATUS:CANCELLED");
      lines.push(
        `SUMMARY:${escape(changed.title)}`,
        `DESCRIPTION:${escape(changed.description)}`,
        `LOCATION:${escape(changed.location)}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(first.getFullYear(), first.getMonth(), 1 - offset + index),
  );
}
export function occursOn(item: Item, day: string) {
  if (!item.due_at || item.deleted_at) return false;
  if (item.all_day && item.schedule_kind === "none")
    return item.start_date <= day && item.end_date > day;
  if (item.schedule_kind && item.schedule_kind !== "none") {
    const from = new Date(day + "T00:00:00"),
      to = new Date(from);
    to.setDate(to.getDate() + 1);
    return eventInstances(item, from, to).length > 0;
  }
  const [year, month, date] = day.split("-").map(Number);
  const start = new Date(year, month - 1, date),
    end = new Date(year, month - 1, date + 1);
  const begins = new Date(item.due_at);
  const ends = item.end_at ? new Date(item.end_at) : begins;
  return (
    begins < end &&
    (ends > start || (ends.getTime() === begins.getTime() && begins >= start))
  );
}
