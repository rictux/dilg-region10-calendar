import { test, expect } from "@playwright/test";

test("summary cards consolidate office reports before counting concurrency", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-22T04:00:00Z") });
  await page.route("**/api/calendar-feed", route => {
    const { url } = route.request().postDataJSON();
    const first = url.includes("dilg.lgmed10");
    const second = url.includes("rtenplanning");
    const office = first ? "LGMED" : second ? "Planning" : url;
    const report = (id, summary) => ({
      id, summary, calendarId: url, calendarName: office, location: "Google Meet",
      start: { dateTime: "2026-09-22T01:00:00Z" },
      end: { dateTime: "2026-09-22T02:00:00Z" },
    });
    const events = first || second ? [report("shared", "Regional coordination meeting")] : [];
    if (first) events.push(report("distinct", "Data management workshop"));
    return route.fulfill({ json: { calendar: { id: url, summary: office }, events } });
  });
  await page.goto("/");
  await expect(page.locator("#sideStatus")).toHaveText("7 of 7 calendars loaded");
  await expect(page.locator(".metric-head > span:first-child")).toHaveText([
    "Unique activities", "Merged reports", "Offices", "Categories", "Concurrent activities",
  ]);
  await expect(page.locator(".metric-value")).toHaveText(["2", "1", "2", "2", "1"]);
  await expect(page.locator("#agenda .event-wrap")).toHaveCount(2);
  await page.locator("#calFilter").click();
  await page.locator("#calendarList input").nth(2).uncheck();
  await expect(page.locator(".metric-value")).toHaveText(["2", "0", "1", "2", "1"]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator("#sideStatus")).toHaveText("7 of 7 calendars loaded");
  await expect(page.locator(".metric-value")).toHaveText(["2", "0", "1", "2", "1"]);
});
