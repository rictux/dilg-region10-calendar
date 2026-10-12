import { test, expect } from "./fixtures.js";

const link = "https://calendar.google.com/calendar/embed?src=office%40example.com";
async function setup(page, { fail = false } = {}) {
  await page.clock.install({ time: new Date("2026-09-22T04:00:00Z") });
  await page.route("**/api/calendar-links", route => route.fulfill({ json: {
    calendars: [{ name: "Regional Office", link }],
  } }));
  await page.route("**/api/calendar-feed", route => route.fulfill(fail
    ? { status: 503, json: { error: "Unavailable" } }
    : { json: { calendar: { id: "office", summary: "Regional Office" }, events: [
      { id: "long", summary: "Long campaign", start: { date: "2026-08-28" }, end: { date: "2026-10-02" } },
      { id: "workshop", summary: "Three-day workshop", start: { date: "2026-09-21" }, end: { date: "2026-09-24" } },
      { id: "midnight", summary: "Evening review", start: { dateTime: "2026-09-21T19:00:00+08:00" }, end: { dateTime: "2026-09-22T00:00:00+08:00" } },
      { id: "meeting", summary: "<img src=x onerror=alert(1)>", location: "Conference room", start: { dateTime: "2026-09-21T09:00:00+08:00" }, end: { dateTime: "2026-09-21T10:00:00+08:00" } },
    ].map(event => ({ ...event, calendarId: "office", calendarName: "Regional Office" })) } }));
}

test("Dashboard and Month share results; calendar covers every occupied day and opens accessible details", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await setup(page);
  await page.goto("/");
  await expect(page.locator('[data-view="dashboard"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#pageTitle")).toHaveText("Activity dashboard");
  await expect(page.locator("#metricEvents")).toHaveText("4");
  const dashboardSummary = await page.locator("#summaryLead").textContent();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator("#summaryLead")).toHaveText(dashboardSummary);
  await page.getByRole("button", { name: "Calendar View", exact: true }).click();
  await expect(page.locator("#calendarMonthCount")).toHaveText("4 activities");
  await expect(page.locator("#dashboardView")).toBeHidden();
  await expect(page.locator("[data-calendar-date]")).toHaveCount(30);
  const day = date => page.locator(`[data-calendar-date="2026-09-${date}"]`);
  await expect(day("21")).toHaveAttribute("aria-label", /4 activities$/);
  await expect(day("21").locator(".calendar-more")).toHaveText("+1 more");
  await expect(day("22")).toHaveAttribute("aria-label", /2 activities$/);
  await expect(day("24")).toHaveAttribute("aria-label", /1 activity$/);
  await expect(day("30")).toHaveAttribute("aria-label", /1 activity$/);
  await expect(day("22")).toHaveClass(/today/);
  await day("22").hover();
  await expect(day("22").locator(".calendar-tooltip")).toBeVisible();
  await day("22").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Tuesday, September 22, 2026" })).toBeVisible();
  await expect(page.locator("#calendarDrawerEvents .event-wrap")).toHaveCount(2);
  await expect(page.locator("#calendarDrawerEvents")).toContainText("Day 2 of 3");
  await expect(page.locator("#calendarDrawerClose")).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.querySelector("#calendarDrawer").contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#calendarDrawer")).not.toBeVisible();
  await expect(day("22")).toBeFocused();
  await day("21").click();
  await expect(page.locator("#calendarDrawerEvents")).toContainText("<img src=x onerror=alert(1)>");
  await expect(page.locator("#calendarDrawerEvents img")).toHaveCount(0);
  const bounds = await page.locator("#calendarDrawer").boundingBox();
  await page.mouse.click(bounds.x + 20, bounds.y + bounds.height - 20);
  await expect(page.locator("#calendarDrawer")).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(page.locator("#calendarDrawer")).not.toBeVisible();
  await page.locator("#calFilter").click();
  await page.locator("#calendarList input").uncheck();
  await expect(page.locator("#calendarMonthCount")).toHaveText("0 activities");
  await page.keyboard.press("Escape");
  await day("22").click();
  await expect(page.locator("#calendarDrawerEvents")).toContainText("No activities scheduled");
  expect(errors).toEqual([]);
});

test("Calendar View fits desktop and mobile and navigates months", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("#metricEvents")).toHaveText("4");
  await page.getByRole("button", { name: "Calendar View", exact: true }).click();
  await expect(page.locator("[data-calendar-date]")).toHaveCount(30);
  await page.screenshot({ path: "test-results/calendar-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const name of ["Dashboard", "Calendar View", "Today", "Week", "Month", "Year"])
    await expect(page.locator(".nav").getByRole("button", { name, exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/calendar-mobile.png", fullPage: true });
  await page.locator('[data-calendar-date="2026-09-22"]').click();
  await expect(page.locator("#calendarDrawerClose")).toBeInViewport();
  expect(await page.locator("#calendarDrawer").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/calendar-drawer-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.locator("#nextBtn").click();
  await expect(page.locator("#periodTitle")).toHaveText("October 2026");
  await expect(page.locator("[data-calendar-date]")).toHaveCount(31);
  await expect(page.locator('[data-calendar-date="2026-10-01"]')).toHaveAttribute("aria-label", /1 activity$/);
  await expect(page.locator('[data-calendar-date="2026-10-02"]')).toHaveAttribute("aria-label", /0 activities$/);
});

test("failed calendar feeds show unavailable data in Calendar View", async ({ page }) => {
  await setup(page, { fail: true });
  await page.goto("/");
  await expect(page.locator("#sideStatus")).toHaveText("0 of 1 calendars loaded");
  await page.getByRole("button", { name: "Calendar View", exact: true }).click();
  await expect(page.locator("#calendarGrid")).toContainText("Calendar data unavailable");
  await expect(page.locator("[data-calendar-date]")).toHaveCount(0);
});

test("calendar lanes preserve distinct activities with the same ID in different offices", async ({ page }) => {
  await setup(page);
  const second = "https://calendar.google.com/calendar/embed?src=second%40example.com";
  await page.route("**/api/calendar-links", route => route.fulfill({ json: {
    calendars: [{ name: "Finance", link }, { name: "Personnel", link: second }],
  } }));
  await page.route("**/api/calendar-feed", route => {
    const { url } = route.request().postDataJSON();
    const summary = url === link ? "Budget preparation" : "Recruitment interviews";
    return route.fulfill({ json: { calendar: { id: url, summary }, events: [{
      id: "same-id", calendarId: url, calendarName: summary, summary,
      start: { date: "2026-09-21" }, end: { date: "2026-09-24" },
    }] } });
  });
  await page.goto("/");
  await expect(page.locator("#metricEvents")).toHaveText("2");
  await page.getByRole("button", { name: "Calendar View", exact: true }).click();
  const previews = page.locator('[data-calendar-date="2026-09-21"] .calendar-event-preview');
  await expect(previews).toHaveCount(2);
  await expect(previews).toHaveText(["Budget preparation", "Recruitment interviews"]);
  const lanes = await previews.evaluateAll(nodes => nodes.map(node => node.style.gridRow));
  expect(new Set(lanes).size).toBe(2);
});
