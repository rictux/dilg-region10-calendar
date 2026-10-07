import { test, expect } from "./fixtures.js";

test("calendar opens and reloads without a page code", async ({ page }) => {
  let obsoleteRequests = 0;
  await page.route("**/api/access", route => { obsoleteRequests++; return route.abort(); });
  await page.route("**/api/calendar-preload**", route => { obsoleteRequests++; return route.abort(); });
  await page.route("**/api/calendar-feed", route => route.fulfill({ json: {
    calendar: { id: route.request().postDataJSON().url, summary: "Office" }, events: [],
  } }));
  await page.goto("/");
  await expect(page.locator("#calendarApp")).toBeVisible();
  await expect(page.locator("#accessGate, #authCode")).toHaveCount(0);
  await expect(page.locator("#sideStatus")).toHaveText("10 of 10 calendars loaded");
  await page.reload();
  await expect(page.locator("#sideStatus")).toHaveText("10 of 10 calendars loaded");
  expect(obsoleteRequests).toBe(0);
});
