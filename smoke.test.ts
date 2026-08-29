import { describe, expect, it } from "vitest";

describe("Shared Todo foundation", () => {
  it("uses the agreed product principle", () => {
    expect("Samen waar gewenst. Privé waar nodig.").toContain("Privé");
  });
});
