import { describe, it, expect } from "vitest";
import { blankItem, itemSchema, mapLink, parseCapture } from "../lib/model";
describe("input and privacy validation", () => {
  it("requires a title", () =>
    expect(itemSchema.safeParse(blankItem("device", null)).success).toBe(
      false,
    ));
  it("defaults to private and unassigned", () => {
    const item = blankItem("device", null);
    expect(item.visibility).toBe("private");
    expect(item.assignees).toEqual([]);
  });
  it("rejects sharing without household", () =>
    expect(
      itemSchema.safeParse({
        ...blankItem("device", null),
        title: "Test",
        visibility: "shared",
      }).success,
    ).toBe(false));
  it("requires date for events", () =>
    expect(
      itemSchema.safeParse({
        ...blankItem("device", null, "event"),
        title: "Test",
      }).success,
    ).toBe(false));
  it("rejects reversed date ranges", () =>
    expect(
      itemSchema.safeParse({
        ...blankItem("device", null, "event"),
        title: "Test",
        due_at: "2026-10-30T12:00:00Z",
        end_at: "2026-10-30T11:00:00Z",
      }).success,
    ).toBe(false));
  it("does not infer an incomplete or invalid date", () => {
    expect(parseCapture("eten 30-10 om 17:00").due).toBe("");
    expect(parseCapture("eten 31-02-2026 om 17:00").due).toBe("");
    expect(parseCapture("1-10-2026 of 2-10-2026 om 17:00").due).toBe("");
  });
  it("extracts complete local date into draft only", () =>
    expect(parseCapture("eten 30-10-2026 om 17:00").due).toBeTruthy());
  it("encodes map parameters", () =>
    expect(mapLink("A&B #1", "google")).toContain("A%26B%20%231"));
});

it("does not choose between multiple possible times", () =>
  expect(parseCapture("Eten 30-10-2026 om 17:00 of 18:00").due).toBe(""));
it("compares date ranges by instant rather than timezone text", () =>
  expect(
    itemSchema.safeParse({
      ...blankItem("device", null, "event"),
      title: "Test",
      due_at: "2026-10-30T17:00:00+02:00",
      end_at: "2026-10-30T16:30:00Z",
    }).success,
  ).toBe(true));
