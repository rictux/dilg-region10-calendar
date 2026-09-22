import { test, expect } from "@playwright/test";

test("organization cards filter activities and preserve selection across views", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-09-22T04:00:00Z") });
  await page.route("**/api/calendar-feed", route => {
    const { url } = route.request().postDataJSON();
    const events = url.includes("dilg.lgmed10") ? [
      { id: "lgu", summary: "DILG LGU consultation", description: "Online consultation", location: "Google Meet" },
      { id: "nga", summary: "DILG NGA meeting", description: "Face-to-face meeting", location: "Conference room" },
    ].map(event => ({ ...event, calendarId: url, calendarName: "Test calendar", start: { dateTime: "2026-09-22T01:00:00Z" }, end: { dateTime: "2026-09-22T02:00:00Z" } })) : [];
    return route.fulfill({ json: { calendar: { id: url, summary: "Test calendar" }, events } });
  });
  await page.goto("/");
  await expect(page.locator("#sideStatus")).toHaveText("5 of 5 calendars loaded");
  const cards = page.getByRole("group", { name: "Filter by organization or group" });
  const lgu = cards.locator('[data-group="LGU"]');
  const nga = cards.locator('[data-group="NGA"]');
  await expect(page.locator("#metricEvents")).toHaveText("2");
  await lgu.click();
  await expect(lgu).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await expect(page.locator("#agenda")).toContainText("DILG LGU consultation");
  await expect(page.locator("#agenda")).not.toContainText("DILG NGA meeting");
  await expect(nga).toContainText("1");
  await page.locator('[data-view="month"]').click();
  await expect(lgu).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-view="day"]').click();
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await nga.click();
  await page.locator("#modeFilter").selectOption("Online");
  await expect(page.locator("#metricEvents")).toHaveText("0");
  await expect(nga).toHaveAttribute("aria-pressed", "true");
  await expect(nga).toContainText("0");
  await nga.press("Enter");
  await expect(cards.locator('[data-group="all"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await page.locator("#modeFilter").selectOption("all");
  await lgu.click();
  await cards.locator('[data-group="all"]').click();
  await expect(page.locator("#metricEvents")).toHaveText("2");
  expect(errors).toEqual([]);
});
