import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/*.test.ts", "smoke.test.ts"] },
});
