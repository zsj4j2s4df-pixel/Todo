export function safeQuery(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}
export function safeOffset(value: unknown) {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(10000, Math.max(0, value))
    : 0;
}
export function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function draftProposal(args: Record<string, unknown>) {
  const title =
    typeof args.title === "string" ? args.title.trim().slice(0, 200) : "";
  const kind = ["task", "event", "reminder"].includes(String(args.kind))
    ? (args.kind as "task" | "event" | "reminder")
    : "task";
  const due_at = typeof args.due_at === "string" ? args.due_at : "";
  if (
    !title ||
    (due_at &&
      (!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(due_at) ||
        !/(Z|[+-]\d\d:\d\d)$/.test(due_at) ||
        !Number.isFinite(Date.parse(due_at)))) ||
    (kind !== "task" && !due_at)
  )
    throw Error("Ongeldig concept. Kies een titel en controleer datum/tijd.");
  return {
    title,
    kind,
    due_at,
    description:
      typeof args.description === "string"
        ? args.description.slice(0, 5000)
        : "",
  };
}
