import { test, expect } from "@playwright/test";

test("preloads at the code prompt and opens the dashboard with ready activities", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-07T04:00:00Z") });
  let prepared = false, opened = false, ordinaryRequests = 0;
  await page.route("**/api/calendar-preload", route => {
    prepared = true;
    return route.fulfill({ json: { sealed: "encrypted-snapshot" } });
  });
  await page.route("**/api/access", route => route.fulfill({ json: { token: "verified" } }));
  await page.route("**/api/calendar-preload/open", route => {
    expect(route.request().headers().authorization).toBe("Bearer verified");
    expect(route.request().postDataJSON().sealed).toBe("encrypted-snapshot");
    opened = true;
    const link = "https://calendar.google.com/calendar/embed?src=test%40example.com";
    return route.fulfill({ json: {
      from: "2026-01-01T00:00:00+08:00", to: "2027-01-01T00:00:00+08:00",
      calendars: [{ id: "1", name: "Planning", link }],
      feeds: [{ link, data: { calendar: { id: "test@example.com", summary: "Planning" }, events: [{ id: "1", summary: "Ready activity", calendarId: "test@example.com", start: { dateTime: "2026-10-07T01:00:00Z" }, end: { dateTime: "2026-10-07T02:00:00Z" } }] } }],
    } });
  });
  for (const path of ["calendar-links", "calendar-feed"]) await page.route(`**/api/${path}`, route => { ordinaryRequests++; return route.abort(); });
  await page.goto("/");
  await expect.poll(() => prepared).toBe(true);
  expect(opened).toBe(false);
  await expect(page.locator("#calendarApp")).toBeHidden();
  await page.getByLabel("Input current Auth Code:").fill("test-code");
  await page.getByRole("button", { name: "Open calendar" }).click();
  await expect(page.locator("#calendarApp")).toBeVisible();
  await expect(page.locator("#sideStatus")).toHaveText("1 of 1 calendars loaded");
  await expect(page.locator("#agenda")).toContainText("Ready activity");
  expect(ordinaryRequests).toBe(0);
});
