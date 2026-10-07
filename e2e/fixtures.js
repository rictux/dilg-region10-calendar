import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const calendars = JSON.parse(readFileSync(new URL("./fixtures/calendar-links.json", import.meta.url), "utf8"));
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/api/calendar-preload", route => route.fulfill({ status: 503, json: {} }));
    await page.route("**/api/calendar-links", (route) => route.fulfill({ json: { calendars } }));
    await page.route("**/api/access", (route) => route.fulfill({ json: { token: "test-page-token" } }));
    for (const method of ["goto", "reload"]) {
      const navigate = page[method].bind(page);
      page[method] = async (...args) => {
        const response = await navigate(...args);
        await page.getByLabel("Input current Auth Code:").fill("test-code");
        await page.getByRole("button", { name: "Open calendar" }).click();
        await expect(page.locator("#accessGate")).toBeHidden();
        return response;
      };
    }
    await use(page);
  },
});
export { expect };
