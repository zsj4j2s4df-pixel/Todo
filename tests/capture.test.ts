import { expect, it } from "vitest";
import { captureFromUrl } from "../lib/capture";
it("accepts share fields as plain text and deduplicates repeated values", () => {
  expect(
    captureFromUrl(
      new URL(
        "https://todo.test/?title=Afspraak&text=Afspraak&url=https%3A%2F%2Fexample.com",
      ),
    )?.text,
  ).toBe("Afspraak\nhttps://example.com");
});
it("requires supported fields and bounds large shared input", () => {
  expect(
    captureFromUrl(new URL("https://todo.test/?code=auth-code")),
  ).toBeNull();
  expect(captureFromUrl(new URL("https://todo.test/?capture=1"))).toEqual({
    text: "",
    truncated: false,
  });
  const result = captureFromUrl(
    new URL("https://todo.test/?text=" + "x".repeat(6000)),
  );
  expect(result?.text).toHaveLength(5000);
  expect(result?.truncated).toBe(true);
});
it("never interprets shared URLs as commands or HTML", () => {
  const text = "<script>alert(1)</script> javascript:alert(1)";
  expect(
    captureFromUrl(
      new URL("https://todo.test/?text=" + encodeURIComponent(text)),
    )?.text,
  ).toBe(text);
});
