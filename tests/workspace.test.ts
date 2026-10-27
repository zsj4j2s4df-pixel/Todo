import { test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { blankItem } from "../lib/model";
import {
  assigneeLabel,
  instantiateTemplate,
  templateFromItem,
} from "../lib/workspace";
test("template instances have fresh identities, unchecked steps and private scope", () => {
  const original = {
    ...blankItem("device", null),
    title: "Vakantie",
    checklist: [{ id: crypto.randomUUID(), text: "Paspoort", done: true }],
  };
  const template = templateFromItem(original, "device");
  const copy = instantiateTemplate(template, "device", null);
  expect(copy.id).not.toBe(original.id);
  expect(copy.checklist[0].id).not.toBe(original.checklist[0].id);
  expect(copy.checklist[0].done).toBe(false);
  expect(copy.visibility).toBe("private");
  expect(original.checklist[0].done).toBe(true);
});
test("assignee labels use explicit assignments rather than creator", () => {
  const i = blankItem("a", null);
  expect(assigneeLabel(i, "a", [])).toBe("Nog niet toegewezen");
  expect(
    assigneeLabel({ ...i, assignees: ["a", "b"] }, "a", [
      { user_id: "b", display_name: "Partner" },
    ]),
  ).toContain("Voor jullie beiden");
});
test("database isolates notes and trash, hides deleted items from AI, restores privately, and locks shared groceries", async () => {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  await db.exec(
    `create role service_role;create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${a}'),('${b}');`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((n) => n.endsWith(".sql") && !n.endsWith("_schedule.sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  const as = async (id: string) =>
    db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  await as(a);
  const h = (
    await db.query<{ h: string }>(
      "select public.create_household('Thuis','A') h",
    )
  ).rows[0].h;
  const code = (
    await db.query<{ c: string }>("select public.create_invite() c")
  ).rows[0].c;
  await as(b);
  await db.query("select public.join_household($1,'B')", [code]);
  await as(a);
  const id = crypto.randomUUID(),
    note = crypto.randomUUID();
  await db.query(
    "insert into items(id,owner_id,household_id,kind,title,priority,timezone,visibility,assignees,list_type) values($1,$2,$3,'task','Boodschappen','normal','Europe/Amsterdam','shared',array[$4::uuid],'shopping')",
    [id, a, h, b],
  );
  await db.query(
    "insert into inbox_notes(id,user_id,body) values($1,$2,'Idee voor later')",
    [note, a],
  );
  await as(b);
  expect((await db.query("select * from inbox_notes")).rows).toHaveLength(0);
  await expect(
    db.query("update inbox_notes set body='hacked' where id=$1 returning id", [
      note,
    ]),
  ).resolves.toMatchObject({ rows: [] });
  await expect(
    db.query(
      "select public.trash_item($1,(select updated_at from items where id=$1))",
      [id],
    ),
  ).rejects.toThrow();
  const step = crypto.randomUUID();
  await db.query("select public.shopping_step($1,$2,'Koffie',null)", [
    id,
    step,
  ]);
  await db.query("select public.shopping_step($1,$2,'Koffie',null)", [
    id,
    step,
  ]);
  await db.query("select public.shopping_step($1,$2,null,true)", [id, step]);
  expect(
    (
      await db.query<{ checklist: any[] }>(
        "select checklist from items where id=$1",
        [id],
      )
    ).rows[0].checklist,
  ).toHaveLength(1);
  await as(a);
  await expect(
    db.query("delete from items where id=$1", [id]),
  ).rejects.toThrow();
  await db.query(
    "select public.trash_item($1,(select updated_at from items where id=$1))",
    [id],
  );
  expect(
    (await db.query("select * from items where id=$1", [id])).rows,
  ).toHaveLength(0);
  expect(
    (await db.query<{ s: { total: number } }>("select public.ai_summary() s"))
      .rows[0].s.total,
  ).toBe(0);
  expect(
    (await db.query<{ t: any[] }>("select public.trash_page(0) t")).rows[0].t,
  ).toHaveLength(1);
  await as(b);
  expect(
    (await db.query<{ t: any[] }>("select public.trash_page(0) t")).rows[0].t,
  ).toHaveLength(0);
  await expect(
    db.query("select public.restore_item($1)", [id]),
  ).rejects.toThrow();
  await expect(
    db.query("select public.shopping_step($1,$2,null,false)", [id, step]),
  ).rejects.toThrow();
  await as(a);
  await db.query("select public.restore_item($1)", [id]);
  expect(
    (
      await db.query<{ visibility: string; assignees: string[] }>(
        "select visibility,assignees from items where id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ visibility: "private", assignees: [] });
  const payload = { ...blankItem(a, null), title: "Van notitie" };
  const converted = (
    await db.query<{ id: string }>("select public.convert_note($1,$2) id", [
      note,
      JSON.stringify(payload),
    ])
  ).rows[0].id;
  expect(
    (
      await db.query<{ id: string }>("select public.convert_note($1,$2) id", [
        note,
        JSON.stringify({ ...payload, id: crypto.randomUUID() }),
      ])
    ).rows[0].id,
  ).toBe(converted);
  await as(b);
  expect((await db.query("select * from items")).rows).toHaveLength(0);
  await db.close();
}, 30000);
