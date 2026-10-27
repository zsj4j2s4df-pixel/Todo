import { Temporal } from "@js-temporal/polyfill";
import { itemSchema, type Item } from "./model";
export const frequencies = {
  none: "Niet herhalen",
  hourly: "Elk uur",
  daily: "Elke dag",
  weekly: "Elke week",
  fortnightly: "Elke twee weken",
  monthly: "Elke maand",
  yearly: "Elk jaar",
};
export type Occurrence = Item & {
  occurrence_index?: number;
  series_version?: string;
};
export function normalizedEvent(item: Item): Item {
  if (item.kind !== "event")
    return itemSchema.parse({
      ...item,
      all_day: false,
      event_type: "standard",
      schedule_kind: "none",
      schedule_exceptions: [],
      start_date: "",
      end_date: "",
    });
  if (!item.all_day)
    return itemSchema.parse({ ...item, start_date: "", end_date: "" });
  const start = Temporal.PlainDate.from(item.start_date),
    end = Temporal.PlainDate.from(item.end_date);
  if (Temporal.PlainDate.compare(end, start) <= 0)
    throw Error("De laatste dag moet op of na de eerste dag liggen.");
  return itemSchema.parse({
    ...item,
    due_at: start.toZonedDateTime(item.timezone).toInstant().toString(),
    end_at: end.toZonedDateTime(item.timezone).toInstant().toString(),
  });
}
export function nextDay(day: string, days = 1) {
  return Temporal.PlainDate.from(day).add({ days }).toString();
}
function amount(kind: string, n: number) {
  switch (kind) {
    case "hourly":
      return { hours: n };
    case "daily":
      return { days: n };
    case "weekly":
      return { weeks: n };
    case "fortnightly":
      return { weeks: n * 2 };
    case "monthly":
      return { months: n };
    case "yearly":
      return { years: n };
    default:
      return {};
  }
}
export function occurrenceAt(root: Item, index: number): Occurrence {
  const item = normalizedEvent(root);
  if (!Number.isInteger(index) || index < 0 || index > 1000000)
    throw Error("Ongeldig herhalingsmoment");
  const base = Temporal.Instant.from(item.due_at)
    .toZonedDateTimeISO(item.timezone)
    .toPlainDateTime();
  const local =
    item.schedule_kind === "hourly"
      ? Temporal.Instant.from(item.due_at)
          .add({ hours: index })
          .toZonedDateTimeISO(item.timezone)
          .toPlainDateTime()
      : base.add(amount(item.schedule_kind, index));
  const start =
    item.schedule_kind === "hourly"
      ? Temporal.Instant.from(item.due_at).add({ hours: index })
      : local
          .toZonedDateTime(item.timezone, { disambiguation: "later" })
          .toInstant();
  const end = item.all_day
    ? Temporal.PlainDate.from(item.end_date)
        .add(amount(item.schedule_kind, index))
        .toZonedDateTime(item.timezone)
        .toInstant()
    : item.end_at
      ? start.add({
          milliseconds: Date.parse(item.end_at) - Date.parse(item.due_at),
        })
      : null;
  // Whole-day duration stays a count of calendar days, including month-end recurrence.
  const wholeEnd = item.all_day
    ? local.toPlainDate().add({
        days: Temporal.PlainDate.from(item.start_date).until(
          Temporal.PlainDate.from(item.end_date),
        ).days,
      })
    : null;
  const result: Occurrence = {
    ...item,
    occurrence_index: index,
    series_version: root.updated_at,
    due_at: start.toString(),
    end_at: wholeEnd
      ? wholeEnd.toZonedDateTime(item.timezone).toInstant().toString()
      : end?.toString() || "",
    start_date: item.all_day ? local.toPlainDate().toString() : "",
    end_date: wholeEnd?.toString() || "",
  };
  const exception = item.schedule_exceptions.find((e) => e.index === index);
  if (exception?.patch) {
    const patch = exception.patch;
    Object.assign(
      result,
      normalizedEvent(
        itemSchema.parse({
          ...result,
          ...patch,
          end_at: patch.end_at === null ? "" : (patch.end_at ?? result.end_at),
          start_date:
            patch.start_date === null
              ? ""
              : (patch.start_date ?? result.start_date),
          end_date:
            patch.end_date === null ? "" : (patch.end_date ?? result.end_date),
        }),
      ),
    );
  }
  return result;
}
function estimate(item: Item, date: Date) {
  const a = Temporal.Instant.from(item.due_at)
    .toZonedDateTimeISO(item.timezone)
    .toPlainDateTime();
  const b = Temporal.Instant.from(date.toISOString())
    .toZonedDateTimeISO(item.timezone)
    .toPlainDateTime();
  const days = a
    .toPlainDate()
    .until(b.toPlainDate(), { largestUnit: "days" }).days;
  switch (item.schedule_kind) {
    case "hourly":
      return Math.floor(a.until(b, { largestUnit: "hours" }).hours);
    case "daily":
      return days;
    case "weekly":
      return Math.floor(days / 7);
    case "fortnightly":
      return Math.floor(days / 14);
    case "monthly":
      return (b.year - a.year) * 12 + b.month - a.month;
    case "yearly":
      return b.year - a.year;
    default:
      return 0;
  }
}
/** Bounded expansion. Missing cancelled instances stay in the series' exception list. */
export function eventInstances(
  root: Item,
  from: Date,
  to: Date,
  limit = 1000,
  displayZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Occurrence[] {
  if (root.kind !== "event" || root.deleted_at || !root.due_at) return [];
  const item = normalizedEvent(root),
    result: Occurrence[] = [];
  if (+to <= +from || +to - +from > 370 * 86400000)
    throw Error("Kies een agendavenster van maximaal één jaar.");
  const day = (d: Date) =>
    d.toLocaleDateString("sv-SE", { timeZone: displayZone });
  const overlaps = (i: Item) =>
    i.all_day
      ? i.start_date <= day(new Date(+to - 1)) && i.end_date > day(from)
      : Date.parse(i.due_at) < +to && Date.parse(i.end_at || i.due_at) >= +from;
  if (item.schedule_kind === "none") return overlaps(item) ? [item] : [];
  const duration = Math.max(
    0,
    Date.parse(item.end_at || item.due_at) - Date.parse(item.due_at),
  );
  const first = Math.max(0, estimate(item, new Date(+from - duration)) - 2),
    last = Math.min(
      1000000,
      estimate(item, to) + 3,
      (item.schedule_count ?? 1000001) - 1,
    );
  if (last - first > 10000)
    throw Error("Te veel afspraken in dit venster. Kies een kortere periode.");
  const candidates = new Set<number>();
  for (let index = first; index <= last; index++) candidates.add(index);
  for (const e of item.schedule_exceptions)
    if (e.patch) candidates.add(e.index);
  for (const index of [...candidates].sort((a, b) => a - b)) {
    if (index >= (item.schedule_count ?? 1000001)) continue;
    const occurrence = occurrenceAt(item, index);
    if (
      item.schedule_until &&
      (occurrence.all_day
        ? occurrence.start_date
        : Temporal.Instant.from(occurrence.due_at)
            .toZonedDateTimeISO(item.timezone)
            .toPlainDate()
            .toString()) > item.schedule_until
    )
      continue;
    if (item.schedule_exceptions.find((e) => e.index === index)?.cancelled)
      continue;
    if (overlaps(occurrence)) {
      result.push(occurrence);
      if (result.length > limit)
        throw Error("Te veel afspraken. Kies een korter venster.");
    }
  }
  result.sort((a, b) => a.due_at.localeCompare(b.due_at));
  if (result.length > limit)
    throw Error("Te veel afspraken. Kies een korter venster.");
  return result;
}
export function freeBlocks(
  items: Item[],
  day: string,
  startHour = 8,
  endHour = 22,
) {
  const start = new Date(day + `T${String(startHour).padStart(2, "0")}:00:00`),
    end = new Date(day + `T${String(endHour).padStart(2, "0")}:00:00`);
  const busy = items
    .filter((i) => i.busy !== false)
    .filter((i) => i.kind === "event")
    .flatMap((i) => eventInstances(i, start, end))
    .map((i) => [
      Math.max(+start, Date.parse(i.due_at)),
      Math.min(+end, Date.parse(i.end_at || i.due_at)),
    ])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const free: { start: Date; end: Date }[] = [];
  let cursor = +start;
  for (const [a, b] of busy) {
    if (a > cursor) free.push({ start: new Date(cursor), end: new Date(a) });
    cursor = Math.max(cursor, b);
  }
  if (cursor < +end) free.push({ start: new Date(cursor), end });
  return free;
}
