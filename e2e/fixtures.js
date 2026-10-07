import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const calendars = JSON.parse(readFileSync(new URL("./fixtures/calendar-links.json", import.meta.url), "utf8"));
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/api/calendar-links", (route) => route.fulfill({ json: { calendars } }));
    await use(page);
  },
});
export { expect };
