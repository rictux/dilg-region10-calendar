import { test, expect } from "./fixtures.js";

test("database links and names override old browser settings and Google feed names", async ({ page }) => {
  const link = "https://calendar.google.com/calendar/embed?src=database-office%40example.com";
  const requested = [];
  await page.clock.install({ time: new Date("2026-09-22T04:00:00Z") });
  await page.addInitScript(() => localStorage.setItem("calendar_digest_links", JSON.stringify([
    "https://calendar.google.com/calendar/embed?src=stale%40example.com",
  ])));
  await page.route("**/api/calendar-links", (route) => route.fulfill({ json: {
    calendars: [{ id: "1", name: "Database office", link }],
  } }));
  await page.route("**/api/calendar-feed", (route) => {
    requested.push(route.request().postDataJSON().url);
    return route.fulfill({ json: {
      calendar: { id: "database-office@example.com", summary: "Old Google name" },
      events: [{
        id: "event-1", summary: "Database calendar activity",
        calendarId: "database-office@example.com", calendarName: "Old Google name",
        start: { dateTime: "2026-09-22T01:00:00Z" },
        end: { dateTime: "2026-09-22T02:00:00Z" },
      }],
    } });
  });
  await page.goto("/");
  await expect(page.locator("#sideStatus")).toHaveText("1 of 1 calendars loaded");
  await expect(page.locator("#backgroundStatus")).toContainText("ready for other views");
  expect(requested).toEqual([link, link]);
  await expect(page.locator("#agenda")).toContainText("Database Office");
  await expect(page.locator("#agenda")).not.toContainText("Old Google name");
  await page.locator("#calFilter").click();
  await expect(page.locator("#calendarList")).toContainText("Database office");
});

for (const status of [200, 503]) {
  test(`empty or unavailable storage does not load hardcoded calendars (${status})`, async ({ page }) => {
    let feedRequests = 0;
    await page.route("**/api/calendar-links", (route) => route.fulfill({ status, json: { calendars: [] } }));
    await page.route("**/api/calendar-feed", (route) => {
      feedRequests++;
      return route.abort();
    });
    await page.goto("/");
    await expect(page.locator("#sideStatus")).toHaveText("Calendar list unavailable");
    await expect(page.locator("#insights")).toContainText(status === 200 ? "No calendars" : "could not be loaded");
    expect(feedRequests).toBe(0);
    await expect(page.locator("#metricEvents")).toHaveText("—");
  });
}
