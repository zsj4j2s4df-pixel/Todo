import { Temporal } from "@js-temporal/polyfill";
const compact = (value: string) =>
  value.replaceAll(/[-:]/g, "").replace(/\.\d+$/, "");
/** Explicit bounded timezone transitions preserve wall-clock series in exported CalDAV data. */
export function timezoneLines(
  zone: string,
  anchorYear: number,
  nowYear = new Date().getFullYear(),
): string[] {
  new Intl.DateTimeFormat("nl", { timeZone: zone });
  const first = Math.min(anchorYear, nowYear - 1),
    last = Math.min(9999, Math.max(anchorYear, nowYear) + 100);
  if (first < 1800 || last - first > 400)
    throw Error("Kies voor deze agendareeks een recentere begindatum.");
  const start = Temporal.ZonedDateTime.from({
      year: first,
      month: 1,
      day: 1,
      timeZone: zone,
    }),
    end = Temporal.ZonedDateTime.from({
      year: last,
      month: 1,
      day: 1,
      timeZone: zone,
    });
  const lines = [
    "BEGIN:VTIMEZONE",
    `TZID:${zone}`,
    `X-LIC-LOCATION:${zone}`,
    "BEGIN:STANDARD",
    `DTSTART:${String(first).padStart(4, "0")}0101T000000`,
    `TZOFFSETFROM:${compact(start.offset)}`,
    `TZOFFSETTO:${compact(start.offset)}`,
    "END:STANDARD",
  ];
  let cursor = start,
    steps = 0;
  for (;;) {
    const next = cursor.getTimeZoneTransition("next");
    if (!next || Temporal.ZonedDateTime.compare(next, end) >= 0) break;
    if (++steps > 800) throw Error("Te veel tijdzoneovergangen.");
    const before = next.subtract({ nanoseconds: 1 }),
      delta = next.offsetNanoseconds - before.offsetNanoseconds;
    const local = next.toPlainDateTime().subtract({ nanoseconds: delta });
    const kind = delta > 0 ? "DAYLIGHT" : "STANDARD";
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${compact(local.toString())}`,
      `TZOFFSETFROM:${compact(before.offset)}`,
      `TZOFFSETTO:${compact(next.offset)}`,
      `END:${kind}`,
    );
    cursor = next;
  }
  lines.push("END:VTIMEZONE");
  return lines;
}
export function localIcalStamp(iso: string, zone: string) {
  return compact(
    Temporal.Instant.from(iso)
      .toZonedDateTimeISO(zone)
      .toPlainDateTime()
      .toString(),
  );
}
