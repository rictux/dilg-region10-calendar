import { defineConfig } from "@playwright/test";
export default defineConfig({
  timeout: 90000,
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:3000", timezoneId: "America/Los_Angeles" },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
});
