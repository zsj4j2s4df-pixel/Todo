import { Temporal } from "@js-temporal/polyfill";
import type { Item } from "./model";
export { prepareRepeat } from "./model";
export function nextOccurrence(item: Item, now = new Date()) {
  if (item.repeat_kind === "none") return null;
  const anchor = Temporal.Instant.from(item.repeat_anchor || item.due_at)
    .toZonedDateTimeISO(item.timezone)
    .toPlainDateTime();
  const localNow = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(item.timezone)
    .toPlainDateTime();
  const days = anchor
    .toPlainDate()
    .until(localNow.toPlainDate(), { largestUnit: "days" }).days;
  const estimate =
    item.repeat_kind === "monthly"
      ? (localNow.year - anchor.year) * 12 + localNow.month - anchor.month
      : item.repeat_kind === "weekly"
        ? Math.trunc(days / 7)
        : days;
  let index = Math.max(item.repeat_index + 1, estimate, 1);
  function at(n: number) {
    const duration =
      item.repeat_kind === "monthly"
        ? { months: n }
        : item.repeat_kind === "weekly"
          ? { weeks: n }
          : { days: n };
    return anchor
      .add(duration)
      .toZonedDateTime(item.timezone, { disambiguation: "later" })
      .toInstant();
  }
  let instant = at(index);
  while (
    Temporal.Instant.compare(
      instant,
      Temporal.Instant.from(now.toISOString()),
    ) <= 0
  ) {
    index++;
    instant = at(index);
  }
  if (index > 1000000)
    throw Error("Herhalingslimiet bereikt. Kies een nieuwe begindatum.");
  return { repeat_index: index, due_at: instant.toString() };
}
export function completeLocal(
  items: Item[],
  item: Item,
  done: boolean,
  now = new Date(),
): Item[] {
  if ((item.status === "done") === done) return items;
  const result = items.map((i) =>
    i.id === item.id
      ? {
          ...i,
          status: done ? ("done" as const) : ("open" as const),
          updated_at: now.toISOString(),
        }
      : i,
  );
  if (
    !done ||
    item.repeat_kind === "none" ||
    items.some((i) => i.repeat_source === item.id)
  )
    return result;
  const next = nextOccurrence(item, now)!;
  const copy: Item = {
    ...item,
    ...next,
    id: crypto.randomUUID(),
    repeat_source: item.id,
    repeat_anchor: item.repeat_anchor || item.due_at,
    status: "open",
    checklist: item.checklist.map((s) => ({ ...s, done: false })),
    end_at: item.end_at
      ? new Date(
          Date.parse(next.due_at) +
            Date.parse(item.end_at) -
            Date.parse(item.due_at),
        ).toISOString()
      : "",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  return [copy, ...result];
}
