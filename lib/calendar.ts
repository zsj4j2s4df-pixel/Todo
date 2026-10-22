import type { Item } from "./model";
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
  for (const i of items.filter((i) => i.kind === "event" && i.due_at)) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${i.id}@todo`,
      `DTSTAMP:${stamp(i.updated_at)}`,
      `DTSTART:${stamp(i.due_at)}`,
    );
    if (i.end_at) lines.push(`DTEND:${stamp(i.end_at)}`);
    lines.push(
      `SUMMARY:${escape(i.title)}`,
      `DESCRIPTION:${escape(i.description)}`,
      `LOCATION:${escape(i.location)}`,
      `CLASS:${i.visibility === "private" ? "PRIVATE" : "CONFIDENTIAL"}`,
      "END:VEVENT",
    );
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
  if (!item.due_at) return false;
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
