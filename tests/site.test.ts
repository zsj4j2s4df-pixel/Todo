import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  APP_ORIGIN,
  MCP_RESOURCE,
  isAllowedAppOrigin,
  isPreviewOrigin,
} from "../lib/site";

test("het app-adres staat op één plek en de database-migratie gebruikt hetzelfde MCP-adres", () => {
  expect(APP_ORIGIN).toBe("https://todo.jesseboontje.workers.dev");
  expect(MCP_RESOURCE).toBe(APP_ORIGIN + "/mcp");
  const migration = readFileSync(
    "supabase/migrations/20261108150116_todo_mcp_resource.sql",
    "utf8",
  );
  expect(migration).toContain(`'${MCP_RESOURCE}'::text`);
});

test("serverfuncties staan nieuw, oud, proeflinks en lokaal toe, en verder niets", () => {
  for (const ok of [
    "https://todo.jesseboontje.workers.dev",
    "https://todo.zsj4j2s4df.workers.dev",
    "https://functie-verhuis-cloudflare-todo.jesseboontje.workers.dev",
    "https://8f3a2b1c-todo.jesseboontje.workers.dev",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ])
    expect(isAllowedAppOrigin(ok), ok).toBe(true);
  for (const bad of [
    null,
    "",
    "https://evil.test",
    "http://todo.jesseboontje.workers.dev",
    "https://todo.jesseboontje.workers.dev/",
    "https://todo.jesseboontje.workers.dev:8443",
    "https://-todo.jesseboontje.workers.dev",
    "https://a.b-todo.jesseboontje.workers.dev",
    "https://x-todo.jesseboontje.workers.dev.evil.test",
    "https://x-todo.zsj4j2s4df.workers.dev",
    "https://evil-todo.jesseboontje.workers.dev@evil.test",
    "https://other.jesseboontje.workers.dev",
  ])
    expect(isAllowedAppOrigin(bad), String(bad)).toBe(false);
  expect(isPreviewOrigin(APP_ORIGIN)).toBe(false);
});
