import { test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { realtimeRequest } from "../supabase/functions/todo-ai/realtime";
import {
  realtimeCallId,
  hangupRealtime,
} from "../supabase/functions/_shared/realtime";
const sid = "11111111-1111-4111-8111-111111111111";
test("provider IDs cannot redirect hangup to another host or arbitrary path", async () => {
  expect(realtimeCallId("/v1/realtime/calls/rtc_12345678")).toBe(
    "rtc_12345678",
  );
  for (const url of [
    "https://evil.example/v1/realtime/calls/rtc_12345678",
    "/v1/realtime/calls/../../settings",
    "/v1/realtime/calls/rtc_12345678?key=x",
  ])
    expect(() => realtimeCallId(url)).toThrow();
  let called = false;
  expect(
    await hangupRealtime("test", "../../secret", (async () => {
      called = true;
      return new Response();
    }) as typeof fetch),
  ).toBe(false);
  expect(called).toBe(false);
});
test("server establishes bounded SDP session and never returns provider credentials", async () => {
  const ops: string[] = [];
  let config: any;
  const client = {
    rpc: async (name: string) => {
      ops.push(name);
      return { data: sid };
    },
  };
  const admin = {
    rpc: async (name: string, args: any) => {
      ops.push(name);
      expect(args.owner_id).toBe("owner");
      return { data: true };
    },
  };
  const api = (async (url: any, init: any) => {
    expect(url).toBe("https://api.openai.com/v1/realtime/calls");
    config = JSON.parse(init.body.get("session"));
    return new Response("v=0\r\nanswer", {
      status: 201,
      headers: { Location: "/v1/realtime/calls/rtc_12345678" },
    });
  }) as typeof fetch;
  const r = await realtimeRequest(
    client,
    admin,
    "owner",
    "test-not-real",
    {
      action: "realtime_start",
      sdp: "v=0\r\noffer",
      timezone: "Europe/Amsterdam",
    },
    "gpt-realtime-2.1",
    api,
  );
  expect(r).toEqual({
    session_id: sid,
    sdp: "v=0\r\nanswer",
    duration_seconds: 90,
  });
  expect(JSON.stringify(r)).not.toContain("test-not-real");
  expect(config.max_output_tokens).toBe(800);
  expect(config.tools.some((t: any) => t.name === "search_items")).toBe(true);
  expect(config.tools.some((t: any) => t.name === "delete_item")).toBe(false);
  expect(ops).toEqual(["reserve_realtime_session", "attach_realtime_call"]);
});
test("failed or late attachment immediately hangs up the provider call", async () => {
  const ops: string[] = [];
  const client = { rpc: async () => ({ data: sid }) };
  const admin = {
    rpc: async (name: string) => {
      ops.push(name);
      return { data: false };
    },
  };
  const api = (async (url: any) =>
    url.endsWith("/hangup")
      ? new Response(null, { status: 200 })
      : new Response("v=0\r\nanswer", {
          status: 201,
          headers: { Location: "/v1/realtime/calls/rtc_12345678" },
        })) as typeof fetch;
  await expect(
    realtimeRequest(
      client,
      admin,
      "owner",
      "test",
      { action: "realtime_start", sdp: "v=0\r\noffer" },
      "gpt-realtime-2.1",
      api,
    ),
  ).rejects.toThrow("verlopen");
  expect(ops).toContain("finish_realtime_call");
});
test("expired session cannot read tools and unsupported actions never gain write access", async () => {
  let reads = 0;
  const client = {
    rpc: async () => ({ data: false }),
    from: () => {
      reads++;
      throw Error();
    },
  };
  await expect(
    realtimeRequest(
      client,
      {},
      "owner",
      "test",
      {
        action: "realtime_tool",
        session_id: sid,
        name: "get_item",
        args: { id: sid },
      },
      "model",
    ),
  ).rejects.toThrow("verlopen");
  expect(reads).toBe(0);
});
test("real database limits session owners, concurrency, tools, cleanup and daily quota", async () => {
  const db = new PGlite();
  const a = sid,
    b = "22222222-2222-4222-8222-222222222222";
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${a}'),('${b}');create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);insert into vault.decrypted_secrets values('todo_push_dispatch_key','fake-dispatch-key-long-enough-for-testing');`,
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
  async function as(id: string) {
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  }
  async function service() {
    await db.exec("reset role;set role service_role;");
  }
  await as(a);
  const row = (
    await db.query<{ id: string }>(
      "select public.reserve_realtime_session() as id",
    )
  ).rows[0].id;
  await expect(
    db.query("select public.reserve_realtime_session()"),
  ).rejects.toThrow("actief");
  await expect(
    db.query("select * from private.realtime_sessions"),
  ).rejects.toThrow();
  await expect(
    db.query("select public.attach_realtime_call($1,$2,$3)", [
      row,
      a,
      "rtc_12345678",
    ]),
  ).rejects.toThrow();
  await as(b);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select public.reserve_realtime_tool($1) as ok",
        [row],
      )
    ).rows[0].ok,
  ).toBe(false);
  await expect(
    db.query("select public.request_realtime_stop($1)", [row]),
  ).rejects.toThrow("toegang");
  await service();
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select public.attach_realtime_call($1,$2,$3) as ok",
        [row, a, "rtc_12345678"],
      )
    ).rows[0].ok,
  ).toBe(true);
  await as(a);
  for (let i = 0; i < 12; i++)
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.reserve_realtime_tool($1) as ok",
          [row],
        )
      ).rows[0].ok,
    ).toBe(true);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select public.reserve_realtime_tool($1) as ok",
        [row],
      )
    ).rows[0].ok,
  ).toBe(false);
  await db.query("select public.request_realtime_stop($1)", [row]);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select public.reserve_realtime_tool($1) as ok",
        [row],
      )
    ).rows[0].ok,
  ).toBe(false);
  await service();
  await expect(
    db.query("select public.claim_realtime_cleanup($1)", ["bad"]),
  ).rejects.toThrow("Unauthorized");
  const cleanup = (
    await db.query<{ jobs: { id: string }[] }>(
      "select public.claim_realtime_cleanup($1) as jobs",
      ["fake-dispatch-key-long-enough-for-testing"],
    )
  ).rows[0].jobs;
  expect(cleanup.map((r) => r.id)).toContain(row);
  await db.query("select public.finish_realtime_call($1,$2)", [
    row,
    "rtc_12345678",
  ]);
  await as(a);
  for (let i = 1; i < 6; i++) {
    const id = (
      await db.query<{ id: string }>(
        "select public.reserve_realtime_session() as id",
      )
    ).rows[0].id;
    await db.query("select public.request_realtime_stop($1)", [id]);
    if (i === 1) {
      await service();
      expect(
        (
          await db.query<{ ok: boolean }>(
            "select public.attach_realtime_call($1,$2,$3) as ok",
            [id, a, "rtc_late123456"],
          )
        ).rows[0].ok,
      ).toBe(false);
      const jobs = (
        await db.query<{ jobs: { id: string }[] }>(
          "select public.claim_realtime_cleanup($1) as jobs",
          ["fake-dispatch-key-long-enough-for-testing"],
        )
      ).rows[0].jobs;
      expect(jobs.map((j) => j.id)).toContain(id);
      await db.query("select public.finish_realtime_call($1,$2)", [
        id,
        "rtc_late123456",
      ]);
      await as(a);
    }
  }
  await expect(
    db.query("select public.reserve_realtime_session()"),
  ).rejects.toThrow("daglimiet");
  await db.exec("reset role;set role anon;");
  await expect(
    db.query("select public.reserve_realtime_session()"),
  ).rejects.toThrow();
  await db.close();
}, 30000);

test("voice confirmation accepts only explicit user commands, never negative or descriptive text", async () => {
  const { confirmsProposal } = await import("../lib/voice-confirmation");
  expect(confirmsProposal("Ja, opslaan!", "create")).toBe(true);
  expect(confirmsProposal("ja verwijderen", "delete")).toBe(true);
  for (const text of [
    "nee niet opslaan",
    "de assistent zegt ja opslaan",
    "ja opslaan deze taak",
  ])
    expect(confirmsProposal(text, "create")).toBe(false);
  expect(confirmsProposal("ja opslaan", "delete")).toBe(false);
});
