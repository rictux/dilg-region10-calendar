import { test, expect } from "@playwright/test";

test("summary cards consolidate office reports before counting concurrency", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-22T04:00:00Z") });
  await page.route("**/api/calendar-feed", route => {
    const { url } = route.request().postDataJSON();
    const first = url.includes("dilg.lgmed10");
    const second = url.includes("rtenplanning");
    const third = url.includes("qmsec10dilg");
    const office = first ? "LGMED" : second ? "Planning" : third ? "Quality Management" : url;
    const report = (id, summary) => ({
      id, summary, calendarId: url, calendarName: office, location: "Google Meet",
      start: { dateTime: "2026-09-22T01:00:00Z" },
      end: { dateTime: "2026-09-22T02:00:00Z" },
    });
    const events = first || second || third ? [report("shared", "Regional coordination meeting")] : [];
    if (first) events.push(report("distinct", "Data management workshop"));
    return route.fulfill({ json: { calendar: { id: url, summary: office }, events } });
  });
  await page.goto("/");
  await expect(page.locator("#sideStatus")).toHaveText("7 of 7 calendars loaded");
  await expect(page.locator(".metric-head > span:first-child")).toHaveText([
    "Unique activities", "Possible duplicate activities", "Offices", "Categories", "Concurrent activities",
  ]);
  // Three reports of one activity still count as one possible duplicate activity.
  await expect(page.locator(".metric-value")).toHaveText(["2", "1", "3", "2", "1"]);
  await expect(page.locator("#agenda .event-wrap")).toHaveCount(2);
  const shared = page.locator(".event-wrap").filter({ hasText: "Regional coordination meeting" });
  await expect(shared.locator("summary")).toHaveCSS("background-image", /linear-gradient/);
  await expect(page.locator('[data-office="LGMED"]')).toHaveCSS("border-left-color", "rgba(37, 99, 235, 0.32)");
  await page.locator("#calFilter").click();
  await page.locator("#calendarList input").nth(2).uncheck();
  await expect(page.locator(".metric-value")).toHaveText(["2", "1", "2", "2", "1"]);
  await page.locator("#calendarList input").nth(3).uncheck();
  await expect(page.locator(".metric-value")).toHaveText(["2", "0", "1", "2", "1"]);
  await expect(shared.locator("summary")).toHaveCSS("background-image", "none");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator("#sideStatus")).toHaveText("7 of 7 calendars loaded");
  await expect(page.locator(".metric-value")).toHaveText(["2", "0", "1", "2", "1"]);
});
