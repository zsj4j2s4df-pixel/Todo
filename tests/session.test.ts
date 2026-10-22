import { expect, it } from "vitest";
import { SessionRequests } from "../lib/session";
function pending() {
  let resolve!: (v: string) => void;
  const promise = new Promise<string>((r) => (resolve = r));
  return { promise, resolve };
}
it("discards account A data after logout and account B login", async () => {
  const gate = new SessionRequests();
  const a = pending();
  const visible: string[] = [];
  gate.reset("A");
  const old = gate.run(
    "A",
    () => a.promise,
    (v) => visible.push(v),
  );
  gate.reset("");
  gate.reset("B");
  await gate.run(
    "B",
    async () => "B data",
    (v) => visible.push(v),
  );
  a.resolve("A private data");
  await old;
  expect(visible).toEqual(["B data"]);
});
it("discards old responses when signing back into the same account", async () => {
  const gate = new SessionRequests();
  const a = pending();
  const visible: string[] = [];
  gate.reset("A");
  const old = gate.run(
    "A",
    () => a.promise,
    (v) => visible.push(v),
  );
  gate.reset("");
  gate.reset("A");
  a.resolve("old private data");
  await old;
  expect(visible).toEqual([]);
});
it("only publishes the most recent refresh", async () => {
  const gate = new SessionRequests();
  const a = pending();
  const visible: string[] = [];
  gate.reset("A");
  const old = gate.run(
    "A",
    () => a.promise,
    (v) => visible.push(v),
  );
  await gate.run(
    "A",
    async () => "new",
    (v) => visible.push(v),
  );
  a.resolve("stale");
  await old;
  expect(visible).toEqual(["new"]);
});
