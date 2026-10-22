import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/cloud",
  use: { baseURL: process.env.TODO_TEST_URL || "http://127.0.0.1:3000" },
  webServer: process.env.TODO_TEST_URL
    ? undefined
    : {
        command: "npm start",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
