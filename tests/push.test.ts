import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { test, expect } from "vitest";
import { allowedPushEndpoint } from "../supabase/functions/push-dispatch/endpoint";
import { dayBrief } from "../lib/brief";
import { blankItem } from "../lib/model";
test("push endpoint allowlist rejects credentials, private networks, lookalike hosts and redirects", () => {
  for (const u of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/Q123",
    "https://wns2.notify.windows.com/w/?token=abc",
  ])
    expect(allowedPushEndpoint(u)).toBe(true);
  for (const u of [
    "http://fcm.googleapis.com/x",
    "https://127.0.0.1/x",
    "https://fcm.googleapis.com.evil.test/x",
    "https://fcm.googleapis.com:8443/x",
    "https://secret@fcm.googleapis.com/x",
    "https://web.push.apple.com/x#frag",
  ])
    expect(allowedPushEndpoint(u)).toBe(false);
});
test("day brief limits steps, prioritizes and detects actual overlaps, not adjacent appointments", () => {
  const now = new Date("2026-10-22T06:00:00Z");
  const base = blankItem("device", null);
  const e = (id: string, due: string, end: string) => ({
    ...base,
    id: {a:"11111111-1111-4111-8111-111111111111",b:"22222222-2222-4222-8222-222222222222",c:"33333333-3333-4333-8333-333333333333"}[id]!,
    kind: "event" as const,
    title: id,
    due_at: due,
    end_at: end,
  });
  const events = [
    e("a", "2026-10-22T09:00:00Z", "2026-10-22T10:00:00Z"),
    e("b", "2026-10-22T09:30:00Z", "2026-10-22T10:30:00Z"),
    e("c", "2026-10-22T10:30:00Z", "2026-10-22T11:00:00Z"),
  ];
  const brief = dayBrief(
    [
      ...events,
      { ...base, id: "done", status: "done" },
      { ...base, id: "future", due_at: "2099-01-01T12:00:00Z" },
    ],
    now,
  );
  expect(brief.next.map((i) => i.title)).toEqual(["a", "b", "c"]);
  expect(brief.clashes).toEqual([[events[0].id,events[1].id]]);
});
test("push subscriptions and outbox enforce identity, privacy, opt-in, lease and deduplication", async () => {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222",
    h = "33333333-3333-4333-8333-333333333333";
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema vault;create table vault.decrypted_secrets(name text primary key,decrypted_secret text);insert into vault.decrypted_secrets values('todo_push_dispatch_key','test-dispatch-key-not-a-real-secret-123456'),('todo_push_vapid_public','test-public'),('todo_push_vapid_private','test-private');insert into auth.users values('${a}'),('${b}');alter default privileges in schema public grant all on tables to anon,authenticated;`,
  );
  for (const name of readdirSync("supabase/migrations")
    .filter(
      (n) =>
        n.endsWith(".sql") &&
        !n.endsWith("_todo_push_schedule.sql") &&
        !n.endsWith("_todo_realtime_schedule.sql") && !n.endsWith("_todo_integrations_schedule.sql"),
    )
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  async function as(id: string) {
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  }
  const key = "test-dispatch-key-not-a-real-secret-123456";
  async function claim(token = key) {
    await db.exec("reset role;set role service_role;");
    return (
      await db.query<{
        jobs: {
          id: string;
          lease: string;
          kind: string;
          tag: string;
          weather?: { latitude: number };
        }[];
      }>("select (public.claim_push_jobs($1))->'jobs' as jobs", [token])
    ).rows[0].jobs;
  }
  await as(a);
  await expect(
    db.query("select public.claim_push_jobs($1)", [key]),
  ).rejects.toThrow();
  await expect(
    db.query("select private.claim_push_jobs($1)", [key]),
  ).rejects.toThrow();
  const sub = (
    await db.query<{ id: string }>(
      `insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,created_at) values($1,'https://fcm.googleapis.com/test',repeat('a',87),repeat('b',22),now()-interval '1 hour') returning id`,
      [a],
    )
  ).rows[0].id;
  await expect(
    db.query(
      `insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values($1,'https://127.0.0.1/test',repeat('a',87),repeat('b',22))`,
      [a],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(`update public.push_subscriptions set user_id=$1 where id=$2`, [
      b,
      sub,
    ]),
  ).rejects.toThrow();
  await as(b);
  expect(
    (await db.query("select * from public.push_subscriptions")).rows,
  ).toHaveLength(0);
  await expect(
    db.query(
      `insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values($1,'https://fcm.googleapis.com/other',repeat('a',87),repeat('b',22))`,
      [a],
    ),
  ).rejects.toThrow();
  await expect(claim("wrong")).rejects.toThrow();
  await db.exec(
    `reset role;insert into public.households values('${h}','Test','${a}');insert into public.household_members values('${h}','${a}','A'),('${h}','${b}','B');`,
  );
  const reminder = (
    await db.query<{ id: string }>(
      `insert into public.items(id,owner_id,household_id,kind,title,priority,timezone,due_at) values(gen_random_uuid(),$1,$2,'reminder','Private','normal','Europe/Amsterdam',now()-interval '1 second') returning id`,
      [a, h],
    )
  ).rows[0].id;
  await db.query(
    "update public.push_subscriptions set reminders_enabled=false where id=$1",
    [sub],
  );
  expect(await claim()).toHaveLength(0);
  await db.exec("reset role;");
  await db.query(
    "update public.push_subscriptions set reminders_enabled=true where id=$1",
    [sub],
  );
  const jobs = await claim();
  expect(jobs).toHaveLength(1);
  expect(jobs[0].kind).toBe("reminder");
  expect(await claim()).toHaveLength(0);
  await db.query("select public.finish_push_job($1,$2,201)", [
    jobs[0].id,
    jobs[0].lease,
  ]);
  expect(await claim()).toHaveLength(0);
  // Retry must recheck rights after an owner revokes a selected share.
  await db.exec("reset role;");
  await db.query(
    `insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,created_at) values($1,'https://fcm.googleapis.com/second',repeat('a',87),repeat('b',22),now()-interval '1 hour')`,
    [b],
  );
  await db.query(
    `update public.items set visibility='selected',selected_users=array[$1::uuid],assignees=array[$1::uuid],due_at=now()-interval '2 seconds' where id=$2`,
    [b, reminder],
  );
  const batch = await claim();
  const forB = batch.find((j) => j.kind === "reminder");
  expect(batch.length).toBeGreaterThan(0);
  await db.exec("reset role;");
  await db.query(
    `update public.items set visibility='private',selected_users='{}',assignees='{}' where id=$1`,
    [reminder],
  );
  await db.exec(
    "update private.push_jobs set retry_at=now() where state='pending'",
  );
  const after = await claim();
  await db.exec("reset role;");
  const leaked = await db.query(
    "select j.id from private.push_jobs j join public.push_subscriptions s on s.id=j.subscription_id where s.user_id=$1 and j.state='pending'",
    [b],
  );
  expect(leaked.rows).toHaveLength(0);
  // An expired provider subscription is removed and cannot be requeued.
  if (after[0]) {
    await db.exec("set role service_role;");
    await db.query("select public.finish_push_job($1,$2,410)", [
      after[0].id,
      after[0].lease,
    ]);
    await db.exec("reset role;");
    expect(
      (
        await db.query("select * from public.push_subscriptions where id=$1", [
          sub,
        ])
      ).rows,
    ).toHaveLength(0);
  }
  expect(forB).toBeDefined();
  await db.exec("reset role;");
  await db.query(
    "insert into public.brief_preferences(user_id,delivery_time,weather_enabled,place_name,latitude,longitude,timezone) values($1,((now() at time zone 'UTC')-interval '10 minutes')::time,true,'Testplaats',52.09,5.12,'UTC')",
    [b],
  );
  await db.query(
    "update public.push_subscriptions set morning_enabled=true where user_id=$1",
    [b],
  );
  const morning = await claim();
  expect(morning.filter((j) => j.kind === "morning")).toHaveLength(1);
  expect(morning.find((j) => j.kind === "morning")?.weather?.latitude).toBe(
    52.09,
  );
  expect(await claim()).toHaveLength(0);
  await db.exec("reset role;");
  await db.query(
    "update public.push_subscriptions set morning_enabled=false where user_id=$1",
    [b],
  );
  await db.exec(
    "update private.push_jobs set retry_at=now() where kind='morning'",
  );
  expect(await claim()).toHaveLength(0);
  await db.close();
}, 20000);
