import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { test, expect } from "vitest";
test("database enforces private, household, selected shares and owner writes", async () => {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222",
    c = "33333333-3333-4333-8333-333333333333",
    d = "44444444-4444-4444-8444-444444444444";
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${a}'),('${b}'),('${c}'),('${d}');`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610220001_todo.sql", "utf8"),
  );
  await db.exec(
    "grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;",
  );
  await db.exec(
    readFileSync("supabase/migrations/202610220002_notifications.sql", "utf8"),
  );
  async function as(id: string) {
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  }
  await as(a);
  const h = await db.query<{ id: string }>(
    "select public.create_household('Thuis','A') as id",
  );
  const hid = h.rows[0].id;
  const invite = await db.query<{ code: string }>(
    "select public.create_invite() as code",
  );
  await as(b);
  await db.query("select public.join_household($1,$2)", [
    invite.rows[0].code,
    "B",
  ]);
  await expect(
    db.query("select public.join_household($1,$2)", [invite.rows[0].code, "B"]),
  ).rejects.toThrow();
  await as(c);
  await db.query("select public.create_household('Anders','C')");
  await as(a);
  const invitation = await db.query<{ code: string }>(
    "select public.create_invite() as code",
  );
  await as(d);
  await db.query("select public.join_household($1,$2)", [
    invitation.rows[0].code,
    "D",
  ]);
  await as(a);
  for (const [title, visibility, selected] of [
    ["Privé", "private", []],
    ["Samen", "shared", []],
    ["Specifiek", "selected", [b]],
  ] as const) {
    await db.query(
      "insert into items(id,owner_id,household_id,kind,title,priority,timezone,visibility,selected_users,assignees) values(gen_random_uuid(),$1,$2,'task',$3,'normal','Europe/Amsterdam',$4,$5,$6)",
      [
        a,
        hid,
        title,
        visibility,
        selected,
        visibility === "selected" ? [b, b] : [],
      ],
    );
  }
  await as(b);
  const visible = await db.query<{ title: string; id: string }>(
    "select title,id from items order by title",
  );
  expect(visible.rows.map((r) => r.title)).toEqual(["Samen", "Specifiek"]);
  const id = visible.rows.find((r) => r.title === "Specifiek")!.id;
  const changed = await db.query(
    "update items set title=$1 where id=$2 returning id",
    ["Hacked", id],
  );
  expect(changed.rows).toHaveLength(0);
  await db.query("select public.complete_item($1,true)", [id]);
  expect(
    (
      await db.query<{ status: string }>(
        "select status from items where id=$1",
        [id],
      )
    ).rows[0].status,
  ).toBe("done");
  const shared = visible.rows.find((r) => r.title === "Samen")!.id;
  await expect(
    db.query("select public.complete_item($1,true)", [shared]),
  ).rejects.toThrow();
  await as(d);
  expect(
    (await db.query<{ title: string }>("select title from items")).rows.map(
      (r) => r.title,
    ),
  ).toEqual(["Samen"]);
  await as(c);
  expect((await db.query("select * from items")).rows).toHaveLength(0);
  await expect(
    db.query("select public.complete_item($1,true)", [id]),
  ).rejects.toThrow();
  await as(a);
  await expect(
    db.query(
      "insert into items(id,owner_id,household_id,kind,title,priority,timezone,visibility,assignees) values(gen_random_uuid(),$1,$2,'task','Leak','normal','UTC','private',$3)",
      [a, hid, [b]],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      "insert into items(id,owner_id,household_id,kind,title,priority,timezone,visibility,selected_users) values(gen_random_uuid(),$1,$2,'task','Outsider','normal','UTC','selected',$3)",
      [a, hid, [c]],
    ),
  ).rejects.toThrow();

  // Only current recipients can read notifications or mark their own rows read.
  await as(b);
  const inbox = await db.query<{ id: string; kind: string }>(
    "select id,kind from notifications",
  );
  expect(inbox.rows.map((n) => n.kind)).toEqual(["assignment"]);
  await db.query("update notifications set read_at=now() where id=$1", [
    inbox.rows[0].id,
  ]);
  await expect(
    db.query("update notifications set kind='completion' where id=$1", [
      inbox.rows[0].id,
    ]),
  ).rejects.toThrow();
  await expect(
    db.query(
      "insert into notifications(user_id,item_id,kind) values($1,$2,$3)",
      [b, id, "assignment"],
    ),
  ).rejects.toThrow();
  await db.query(
    "insert into notification_preferences(user_id,assignment_enabled) values($1,false)",
    [b],
  );
  await expect(
    db.query("update notification_preferences set user_id=$1", [c]),
  ).rejects.toThrow();
  await as(a);
  expect(
    (
      await db.query<{ kind: string }>("select kind from notifications")
    ).rows.map((n) => n.kind),
  ).toEqual(["completion"]);
  await db.query("update items set assignees='{}' where id=$1", [id]);
  await db.query("update items set assignees=$1 where id=$2", [[b], id]);
  await as(b);
  expect((await db.query("select id from notifications")).rows).toHaveLength(1);
  await as(a);
  await db.query(
    "insert into notification_preferences(user_id,completion_enabled) values($1,false)",
    [a],
  );
  await db.query("update items set status='open' where id=$1", [id]);
  await as(b);
  await db.query("select public.complete_item($1,true)", [id]);
  await as(a);
  expect((await db.query("select id from notifications")).rows).toHaveLength(1);
  await as(d);
  expect((await db.query("select id from notifications")).rows).toHaveLength(0);
  await as(c);
  expect((await db.query("select id from notifications")).rows).toHaveLength(0);
  await as(a);
  await db.query(
    "update items set visibility='private',assignees='{}',selected_users='{}' where id=$1",
    [id],
  );
  await as(b);
  expect((await db.query("select id from notifications")).rows).toHaveLength(0);
  expect(
    (await db.query("update notifications set read_at=now() returning id"))
      .rows,
  ).toHaveLength(0);
  await as(a);
  await db.query("delete from items where id=$1", [id]);
  expect((await db.query("select id from notifications")).rows).toHaveLength(0);
  await db.exec("reset role;set role anon;");
  await expect(db.query("select * from notifications")).rejects.toThrow();
  await db.close();
}, 30000);
