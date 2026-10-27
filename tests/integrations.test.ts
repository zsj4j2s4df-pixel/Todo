import { test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
test("connector secrets stay server-only; leases prevent stale sync after reconnect/disconnect and snapshots deduplicate", async () => {
  const db = new PGlite(),
    a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  await db.exec(`create role service_role;create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${a}'),('${b}');
 -- Local Vault fixture emulates only the SQL interface, not encryption.
 create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text);
 create view vault.decrypted_secrets as select id,name,secret decrypted_secret from vault.secrets;
 create function vault.create_secret(value text,secret_name text) returns uuid language plpgsql as $$declare made uuid;begin insert into vault.secrets(name,secret) values(secret_name,value) returning id into made;return made;end$$;
 create function vault.update_secret(secret_id uuid,value text) returns void language sql as $$update vault.secrets set secret=value where id=secret_id$$;`);
  for (const f of readdirSync("supabase/migrations")
    .filter((n) => n.endsWith(".sql") && !n.endsWith("_schedule.sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  const service = () => db.exec("reset role;set role service_role;");
  const as = async (id: string) =>
    db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  const scalar = async (sql: string, args: unknown[]) => {
    await service();
    return (await db.query<{ v: any }>(sql, args)).rows[0].v;
  };
  const connect = () =>
    scalar(
      "select public.integration_connect($1,'google_calendar','fixture@example.test',$2) v",
      [
        a,
        JSON.stringify({
          access_token: "fixture-only",
          expires_at: 9999999999999,
        }),
      ],
    );
  const id = await connect();
  await as(b);
  expect((await db.query("select id from integrations")).rows).toHaveLength(0);
  await as(a);
  expect((await db.query("select id from integrations")).rows).toHaveLength(1);
  await expect(
    db.query("select public.integration_claim($1,$2)", [a, id]),
  ).rejects.toThrow();
  await expect(
    db.query("select * from private.integration_secrets"),
  ).rejects.toThrow();
  await expect(
    db.query("select * from vault.decrypted_secrets"),
  ).rejects.toThrow();
  const claim = await scalar("select public.integration_claim($1,$2) v", [
    a,
    id,
  ]);
  await expect(
    scalar("select public.integration_claim($1,$2) v", [b, id]),
  ).rejects.toThrow();
  await expect(
    scalar("select public.integration_claim($1,$2) v", [a, id]),
  ).rejects.toThrow();
  await scalar(
    "select public.integration_finish($1,$2,$3,$4,'connected',null) v",
    [a, id, claim.lease, JSON.stringify(claim.credentials)],
  );
  await scalar(
    "select public.integration_select($1,$2,array['primary'],false,'{}','{\"primary\":\"Privé\"}') v",
    [a, id],
  );
  const lease = await scalar("select public.integration_claim($1,$2) v", [
    a,
    id,
  ]);
  const event = {
    calendar_id: "primary",
    event_id: "stable-event",
    version: '"v1"',
    item: {
      title: "Bronafspraak",
      description: "",
      due_at: "2026-10-26T10:00:00Z",
      end_at: "2026-10-26T11:00:00Z",
      timezone: "Europe/Amsterdam",
      all_day: false,
    },
    resource: { id: "stable-event" },
  };
  const sync = (entries: any[], key = lease.lease) =>
    scalar(
      "select public.integration_sync($1,$2,$3,$4,'2026-10-20','2026-11-20') v",
      [a, id, key, JSON.stringify(entries)],
    );
  expect(await sync([event])).toBe(1);
  expect(await sync([event])).toBe(1);
  const cache = [
    { calendar_id: "primary", cursor: "fixture-cursor", events: [event] },
  ];
  await scalar(
    "select public.integration_sync($1,$2,$3,$4,'2026-10-20','2026-11-20',true,$5) v",
    [a, id, lease.lease, JSON.stringify([event]), JSON.stringify(cache)],
  );
  expect(
    await scalar(
      "select public.integration_cache($1,$2,'2026-10-20','2026-11-20') v",
      [a, id],
    ),
  ).toEqual(cache);
  expect(
    await scalar(
      "select public.integration_cache($1,$2,'2026-10-20','2026-11-20') v",
      [b, id],
    ),
  ).toBeNull();
  expect(
    await scalar(
      "select public.integration_cache($1,$2,'2026-10-21','2026-11-21') v",
      [a, id],
    ),
  ).toBeNull();
  await as(a);
  await expect(
    db.query(
      "select public.integration_cache($1,$2,'2026-10-20','2026-11-20')",
      [a, id],
    ),
  ).rejects.toThrow();
  await expect(
    scalar(
      "select public.integration_sync($1,$2,$3,$4,'2026-10-20','2026-11-20',true,'{}') v",
      [
        a,
        id,
        lease.lease,
        JSON.stringify([
          { ...event, item: { ...event.item, title: "Rollback" } },
        ]),
      ],
    ),
  ).rejects.toThrow();

  await as(a);
  const rows = (
    await db.query<{ id: string; updated_at: string }>(
      "select id,updated_at,title from items",
    )
  ).rows;
  expect(rows).toHaveLength(1);
  expect((rows[0] as any).title).toBe("Bronafspraak");
  await expect(
    db.query("update items set title='Bypass' where id=$1 returning id", [
      rows[0].id,
    ]),
  ).resolves.toMatchObject({ rows: [] });
  await expect(
    db.query("select public.complete_item($1,true)", [rows[0].id]),
  ).rejects.toThrow();
  await db.query(
    "select public.trash_item($1,(select updated_at from items where id=$1))",
    [rows[0].id],
  );
  await sync([event]);
  await as(a);
  expect((await db.query("select * from items")).rows).toHaveLength(0);
  await db.query("select public.restore_item($1)", [rows[0].id]);
  expect((await db.query("select * from items")).rows).toHaveLength(1);
  await sync([]);
  await as(a);
  expect((await db.query("select * from items")).rows).toHaveLength(0);
  await expect(
    db.query("select public.restore_item($1)", [rows[0].id]),
  ).rejects.toThrow();
  // Reconnecting the same account preserves identity but invalidates the old lease.
  const same = await connect();
  expect(same).toBe(id);
  await expect(sync([event])).rejects.toThrow();
  const newClaim = await scalar("select public.integration_claim($1,$2) v", [
    a,
    id,
  ]);
  await scalar("select public.integration_disconnect($1,$2,true) v", [a, id]);
  await expect(sync([event], newClaim.lease)).rejects.toThrow();
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select * from private.integration_secrets where connection_id=$1",
        [id],
      )
    ).rows,
  ).toHaveLength(0);
  await db.exec("reset role");
  expect(
    (
      await db.query("select * from vault.secrets where name=$1", [
        "todo-connector-" + id,
      ])
    ).rows,
  ).toHaveLength(0);
  await db.close();
}, 30000);
