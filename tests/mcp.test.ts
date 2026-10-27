import { test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { blankItem } from "../lib/model";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
test("MCP OAuth binds PKCE, audience and user; proposals require app confirmation, are idempotent and revoke immediately", async () => {
  const db = new PGlite(),
    a = "11111111-1111-4111-8111-111111111111",
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
  const service = () => db.exec("reset role;set role service_role;");
  const api = async (operation: string, p: any) => {
    await service();
    return (
      await db.query<{ v: any }>("select public.mcp_api($1,$2) v", [
        operation,
        JSON.stringify(p),
      ])
    ).rows[0].v;
  };
  const resource = "https://todo.zsj4j2s4df.workers.dev/mcp",
    redirect_uri = "https://client.example.test/callback",
    challenge = "A".repeat(43);
  await as(a);
  await expect(
    db.query("select public.mcp_api('grants','{}')"),
  ).rejects.toThrow();
  const client = await api("register", {
    name: "Fixture client",
    redirect_uris: [redirect_uri],
    auth_method: "none",
  });
  const request = await api("authorize", {
    client_id: client.client_id,
    redirect_uri,
    state: "fixture-state",
    challenge,
    scopes: ["todo:read", "todo:prepare"],
    resource,
  });
  await expect(
    api("authorize", {
      client_id: client.client_id,
      redirect_uri: "https://evil.test/cb",
      state: "s",
      challenge,
      scopes: ["todo:read"],
      resource,
    }),
  ).rejects.toThrow();
  const consent = await api("consent_info", {
    user_id: a,
    request_id: request.request_id,
  });
  expect(consent.client_name).toBe("Fixture client");
  await api("consent", {
    user_id: a,
    request_id: request.request_id,
    scopes: ["todo:read", "todo:prepare"],
    code_hash: hash("code"),
  });
  const exchange = {
    client_id: client.client_id,
    resource,
    redirect_uri,
    code_hash: hash("code"),
    verifier_challenge: challenge,
    access_hash: hash("a-token"),
    refresh_hash_new: hash("a-refresh"),
  };
  await expect(
    api("token", { ...exchange, verifier_challenge: "wrong" }),
  ).rejects.toThrow();
  await expect(
    api("token", { ...exchange, resource: "https://other.test/mcp" }),
  ).rejects.toThrow();
  await api("token", exchange);
  await expect(api("token", exchange)).rejects.toThrow();
  await as(b);
  const other = crypto.randomUUID();
  await db.query(
    "insert into items(id,owner_id,kind,title,priority,timezone) values($1,$2,'task','B private','normal','Europe/Amsterdam')",
    [other, b],
  );
  const token_hash = hash("a-token");
  expect(await api("read", { token_hash, kind: "items" })).toEqual([]);
  expect(await api("read", { token_hash, kind: "one", id: other })).toBeNull();
  const item = {
    ...blankItem(b, null),
    title: "Via MCP",
    due_at: null,
    end_at: null,
    start_date: null,
    end_date: null,
    schedule_until: null,
  };
  const proposal = await api("prepare", {
    token_hash,
    action: "create",
    payload: { item },
  });
  expect(await api("read", { token_hash, kind: "items" })).toEqual([]);
  await expect(
    api("proposal_execute", { user_id: b, proposal_id: proposal.proposal_id }),
  ).rejects.toThrow();
  const result = await api("proposal_execute", {
    user_id: a,
    proposal_id: proposal.proposal_id,
  });
  expect(
    await api("proposal_execute", {
      user_id: a,
      proposal_id: proposal.proposal_id,
    }),
  ).toEqual(result);
  const owned = await api("read", { token_hash, kind: "items" });
  expect(owned).toHaveLength(1);
  expect(owned[0].owner_id).toBe(a);
  expect(owned[0].visibility).toBe("private");
  const deletion = await api("prepare", {
    token_hash,
    action: "delete",
    payload: { id: result.id },
    expected_updated_at: owned[0].updated_at,
  });
  await as(a);
  await db.query("update items set title='Nieuwere versie' where id=$1", [
    result.id,
  ]);
  await expect(
    api("proposal_execute", { user_id: a, proposal_id: deletion.proposal_id }),
  ).rejects.toThrow(/stale/);
  const grant = (await api("grants", { user_id: a }))[0];
  await expect(
    api("revoke", { user_id: b, grant_id: grant.id }),
  ).rejects.toThrow();
  await api("refresh", {
    client_id: client.client_id,
    resource,
    refresh_hash: hash("a-refresh"),
    requested_scopes: ["todo:read"],
    access_hash: hash("new-access"),
    refresh_hash_new: hash("new-refresh"),
  });
  await expect(api("read", { token_hash, kind: "items" })).rejects.toThrow();
  await expect(
    api("refresh", {
      client_id: client.client_id,
      refresh_hash: hash("a-refresh"),
      access_hash: hash("replay"),
      refresh_hash_new: hash("replay-refresh"),
    }),
  ).rejects.toThrow();
  await expect(
    api("prepare", {
      token_hash: hash("new-access"),
      action: "note",
      payload: { body: "Cannot write" },
    }),
  ).rejects.toThrow(/scope/);
  await api("revoke", { user_id: a, grant_id: grant.id });
  await expect(
    api("read", { token_hash: hash("new-access"), kind: "items" }),
  ).rejects.toThrow();
  await expect(
    api("refresh", {
      client_id: client.client_id,
      refresh_hash: hash("new-refresh"),
      access_hash: hash("after-revoke"),
      refresh_hash_new: hash("after-revoke-refresh"),
    }),
  ).rejects.toThrow();
  await db.close();
}, 30000);
