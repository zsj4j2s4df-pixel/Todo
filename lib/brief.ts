import type { Item } from "./model";
export function dayBrief(items: Item[], now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const open = items.filter((i) => i.status === "open");
  const events = open
    .filter(
      (i) =>
        i.kind === "event" &&
        i.due_at &&
        Date.parse(i.due_at) < +end &&
        Date.parse(i.end_at || i.due_at) >= +start,
    )
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  const rank = { high: 0, normal: 1, low: 2 };
  const tasks = open
    .filter(
      (i) => i.kind !== "event" && (!i.due_at || Date.parse(i.due_at) < +end),
    )
    .sort(
      (a, b) =>
        rank[a.priority] - rank[b.priority] ||
        (a.due_at || "9999").localeCompare(b.due_at || "9999"),
    );
  const clashes: [string, string][] = [];
  for (let a = 0; a < events.length; a++)
    for (let b = a + 1; b < events.length; b++)
      if (
        events[a].end_at &&
        events[b].end_at &&
        Date.parse(events[a].due_at) < Date.parse(events[b].end_at) &&
        Date.parse(events[b].due_at) < Date.parse(events[a].end_at)
      )
        clashes.push([events[a].id, events[b].id]);
  return {
    next: [
      ...events.filter((i) => Date.parse(i.end_at || i.due_at) >= +now),
      ...tasks,
    ].slice(0, 3),
    overdue: open.filter(
      (i) => i.due_at && Date.parse(i.due_at) < +start && i.kind !== "event",
    ).length,
    clashes,
  };
}
