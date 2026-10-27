import { test, expect } from "vitest";
import { blankItem } from "../lib/model";
import {
  normalizedEvent,
  eventInstances,
  occurrenceAt,
  freeBlocks,
} from "../lib/schedule";
const root = () => ({
  ...blankItem("device", null, "event"),
  title: "Agenda",
  due_at: "2027-01-31T08:00:00Z",
  end_at: "2027-01-31T09:00:00Z",
  timezone: "Europe/Amsterdam",
});
test("month-end and leap-day recurrence retain their original anchor", () => {
  const monthly = { ...root(), schedule_kind: "monthly" as const };
  expect(occurrenceAt(monthly, 1).due_at).toBe("2027-02-28T08:00:00Z");
  expect(occurrenceAt(monthly, 2).due_at).toBe("2027-03-31T07:00:00Z");
  const yearly = {
    ...root(),
    due_at: "2028-02-29T08:00:00Z",
    end_at: "",
    schedule_kind: "yearly" as const,
  };
  expect(occurrenceAt(yearly, 1).due_at).toBe("2029-02-28T08:00:00Z");
  expect(occurrenceAt(yearly, 4).due_at).toBe("2032-02-29T08:00:00Z");
});
test("hourly recurrence uses elapsed hours through both daylight-saving transitions", () => {
  for (const date of ["2027-03-28T00:30:00Z", "2027-10-31T00:30:00Z"]) {
    const i = {
      ...root(),
      due_at: date,
      end_at: "",
      schedule_kind: "hourly" as const,
    };
    for (let n = 0; n < 4; n++)
      expect(Date.parse(occurrenceAt(i, n).due_at)).toBe(
        Date.parse(date) + n * 3600000,
      );
  }
});
test("whole days retain date and exclusive end, including a 23-hour day", () => {
  const i = normalizedEvent({
    ...root(),
    all_day: true,
    start_date: "2027-03-28",
    end_date: "2027-03-29",
    schedule_kind: "yearly",
  });
  expect(Date.parse(i.end_at) - Date.parse(i.due_at)).toBe(23 * 3600000);
  expect(occurrenceAt(i, 1).start_date).toBe("2028-03-28");
  expect(occurrenceAt(i, 1).end_date).toBe("2028-03-29");
});
test("bounded series expansion honors count, until, cancellation and moved exceptions", () => {
  const i = {
    ...root(),
    schedule_kind: "weekly" as const,
    schedule_count: 4,
    schedule_until: "",
    schedule_exceptions: [
      { index: 1, cancelled: true },
      {
        index: 3,
        cancelled: false,
        patch: {
          title: "Verplaatst",
          due_at: "2027-02-03T08:00:00Z",
          end_at: "2027-02-03T09:00:00Z",
        },
      },
    ],
  };
  const found = eventInstances(
    i,
    new Date("2027-02-01T00:00:00Z"),
    new Date("2027-03-01T00:00:00Z"),
  );
  expect(found.map((e) => e.title)).toEqual(["Verplaatst", "Agenda"]);
  expect(found.map((e) => e.occurrence_index)).toEqual([3, 2]);
  expect(
    eventInstances(
      { ...i, deleted_at: new Date().toISOString() },
      new Date("2027-02-01"),
      new Date("2027-03-01"),
    ),
  ).toHaveLength(0);
  expect(() =>
    eventInstances(
      {
        ...i,
        schedule_kind: "hourly",
        schedule_count: null,
        schedule_until: "",
        schedule_exceptions: [],
      },
      new Date("2027-01-01"),
      new Date("2027-12-01"),
    ),
  ).toThrow(/Te veel/);
});
test("free blocks merge overlaps and respect the selected time window", () => {
  const day = "2027-01-31",
    start = new Date(day + "T09:00:00").toISOString(),
    end = new Date(day + "T11:00:00").toISOString();
  const blocks = freeBlocks([{ ...root(), due_at: start, end_at: end }], day);
  expect(blocks.map((b) => [b.start.getHours(), b.end.getHours()])).toEqual([
    [8, 9],
    [11, 22],
  ]);
  expect(freeBlocks([{...root(),busy:false,due_at:start,end_at:end}],day).map(b=>[b.start.getHours(),b.end.getHours()])).toEqual([[8,22]]);
});
