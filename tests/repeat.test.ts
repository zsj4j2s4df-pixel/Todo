import { test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { blankItem, itemSchema } from "../lib/model";
import { nextOccurrence, completeLocal, prepareRepeat } from "../lib/repeat";
const vectors: [string, "hourly" | "daily" | "weekly" | "fortnightly" | "monthly" | "yearly", string, string][] = [
  ["2027-10-31T00:30:00Z","hourly","2027-10-31T00:40:00Z","2027-10-31T01:30:00Z"],
  ["2027-03-14T01:30:00Z","fortnightly","2027-03-15T12:00:00Z","2027-03-28T01:30:00Z"],
  ["2028-02-29T08:00:00Z","yearly","2028-03-01T12:00:00Z","2029-02-28T08:00:00Z"],
  [
    "2027-03-27T01:30:00Z",
    "daily",
    "2027-03-27T12:00:00Z",
    "2027-03-28T01:30:00Z",
  ],
  [
    "2027-03-21T01:30:00Z",
    "weekly",
    "2027-03-28T12:00:00Z",
    "2027-04-04T00:30:00Z",
  ],
  [
    "2027-10-24T00:30:00Z",
    "weekly",
    "2027-10-24T12:00:00Z",
    "2027-10-31T01:30:00Z",
  ],
  [
    "2027-01-31T08:00:00Z",
    "monthly",
    "2027-01-31T12:00:00Z",
    "2027-02-28T08:00:00Z",
  ],
  [
    "2027-01-31T08:00:00Z",
    "monthly",
    "2027-02-28T12:00:00Z",
    "2027-03-31T07:00:00Z",
  ],
  [
    "2028-01-31T08:00:00Z",
    "monthly",
    "2028-01-31T12:00:00Z",
    "2028-02-29T08:00:00Z",
  ],
  [
    "2020-01-01T08:00:00Z",
    "daily",
    "2026-10-23T12:00:00Z",
    "2026-10-24T07:00:00Z",
  ],
];
test("recurrence keeps local anchor time, month-end, leap day and skips missed occurrences", () => {
  for (const [anchor, frequency, after, expected] of vectors) {
    const item = prepareRepeat({
      ...blankItem("device", null),
      title: "Routine",
      timezone: "Europe/Amsterdam",
      due_at: anchor,
      repeat_kind: frequency,
    });
    expect(Date.parse(nextOccurrence(item, new Date(after))!.due_at)).toBe(
      Date.parse(expected),
    );
  }
});
test("local completion creates exactly one private continuation and resets steps", () => {
  const item = prepareRepeat({
    ...blankItem("device", null),
    title: "Routine",
    due_at: "2099-01-31T08:00:00Z",
    timezone: "Europe/Amsterdam",
    repeat_kind: "monthly",
    checklist: [{ id: crypto.randomUUID(), text: "Stap", done: true }],
  });
  const now = new Date("2026-10-23T12:00:00Z");
  const result = completeLocal([item], item, true, now);
  expect(result).toHaveLength(2);
  expect(result[0].repeat_source).toBe(item.id);
  expect(result[0].visibility).toBe("private");
  expect(result[0].checklist[0].done).toBe(false);
  const parent = result.find((i) => i.id === item.id)!;
  expect(completeLocal(result, parent, true, now)).toHaveLength(2);
  const reopened = completeLocal(result, parent, false, now);
  expect(
    completeLocal(reopened, reopened.find((i) => i.id === item.id)!, true, now),
  ).toHaveLength(2);
  expect(() => itemSchema.parse({ ...item, due_at: "" })).toThrow();
  expect(() => itemSchema.parse({ ...item, kind: "event" })).toThrow();
});
test("Postgres agrees with local dates and preserves privacy, idempotence and root metadata", async () => {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222",
    c = "33333333-3333-4333-8333-333333333333",
    h = crypto.randomUUID();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${a}'),('${b}'),('${c}');`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter(
      (n) =>
        n.endsWith(".sql") &&
        !n.endsWith("_todo_push_schedule.sql") &&
        !n.endsWith("_todo_realtime_schedule.sql") && !n.endsWith("_todo_integrations_schedule.sql"),
    )
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  for (const [anchor, frequency, after, expected] of vectors) {
    const id = crypto.randomUUID();
    await db.query(
      `insert into public.items(id,owner_id,kind,title,priority,timezone,due_at,repeat_kind) values($1,$2,'task','Routine','normal','Europe/Amsterdam',$3,$4)`,
      [id, a, anchor, frequency],
    );
    const next = (
      await db.query<{ due_at: string }>(
        "select r.* from public.items i cross join lateral private.next_repeat(i,$1::timestamptz) r where i.id=$2",
        [after, id],
      )
    ).rows[0];
    expect(Date.parse(String(next.due_at))).toBe(Date.parse(expected));
  }
  await db.exec(
    `insert into public.households values('${h}','Test','${a}');insert into public.household_members values('${h}','${a}','A'),('${h}','${b}','B');`,
  );
  async function as(id: string) {
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  }
  await as(a);
  const id = crypto.randomUUID();
  await db.query(
    `insert into public.items(id,owner_id,household_id,kind,title,priority,timezone,due_at,repeat_kind,visibility,assignees,checklist) values($1,$2,$3,'task','Samen routine','normal','Europe/Amsterdam','2099-01-31T08:00:00Z','monthly','shared',array[$4::uuid],$5::jsonb)`,
    [
      id,
      a,
      h,
      b,
      JSON.stringify([
        { id: crypto.randomUUID(), text: "Meenemen", done: true },
      ]),
    ],
  );
  await as(b);
  await expect(
    db.query(
      "insert into public.items(id,owner_id,kind,title,priority,timezone,repeat_source) values(gen_random_uuid(),$1,'task','Bad link','normal','Europe/Amsterdam',$2)",
      [b, id],
    ),
  ).rejects.toThrow("Ongeldige herhaling");
  await db.query("select public.complete_item($1,true)", [id]);
  let children = (
    await db.query<{
      id: string;
      owner_id: string;
      checklist: { done: boolean }[];
    }>("select * from public.items where repeat_source=$1", [id])
  ).rows;
  expect(children).toHaveLength(1);
  expect(children[0].owner_id).toBe(a);
  expect(children[0].checklist[0].done).toBe(false);
  await db.query("select public.complete_item($1,true)", [id]);
  await db.query("select public.complete_item($1,false)", [id]);
  await db.query("select public.complete_item($1,true)", [id]);
  expect(
    (await db.query("select id from public.items where repeat_source=$1", [id]))
      .rows,
  ).toHaveLength(1);
  await as(c);
  expect((await db.query("select * from public.items")).rows).toHaveLength(0);
  await expect(
    db.query("select public.complete_item($1,true)", [id]),
  ).rejects.toThrow("toegang");
  await as(a);
  await db.query(
    "update public.items set due_at='2099-05-15T07:00:00Z',repeat_anchor='1900-01-01',repeat_index=999 where id=$1",
    [children[0].id],
  );
  const changed = (
    await db.query<{
      repeat_index: number;
      repeat_anchor: string;
      due_at: string;
    }>(
      "select repeat_index,repeat_anchor,due_at from public.items where id=$1",
      [children[0].id],
    )
  ).rows[0];
  expect(changed.repeat_index).toBe(0);
  expect(changed.repeat_anchor).toEqual(changed.due_at);
  const hash = "a".repeat(64);
  await db.query(
    "insert into public.items(id,owner_id,kind,title,priority,timezone,due_at,import_uid) values(gen_random_uuid(),$1,'event','Import','normal','UTC','2099-01-01T10:00:00Z',$2)",
    [a, hash],
  );
  await expect(
    db.query(
      "insert into public.items(id,owner_id,kind,title,priority,timezone,due_at,import_uid) values(gen_random_uuid(),$1,'event','Duplicate','normal','UTC','2099-01-01T10:00:00Z',$2)",
      [a, hash],
    ),
  ).rejects.toThrow();
  await as(b);
  await db.query(
    "insert into public.items(id,owner_id,kind,title,priority,timezone,due_at,import_uid) values(gen_random_uuid(),$1,'event','Own import','normal','UTC','2099-01-01T10:00:00Z',$2)",
    [b, hash],
  );
  expect(
    (await db.query("select id from public.items where import_uid=$1", [hash]))
      .rows,
  ).toHaveLength(1);
  await db.close();
}, 30000);
