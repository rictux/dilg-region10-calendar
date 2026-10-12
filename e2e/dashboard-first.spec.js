import { test, expect } from "./fixtures.js";

const link = "https://calendar.google.com/calendar/embed?src=office%40example.com";
async function setup(page) {
  await page.clock.install({ time: new Date("2026-09-22T04:00:00Z") });
  await page.route("**/api/calendar-links", route => route.fulfill({ json: { calendars: [{ name: "Office", link }] } }));
}
function feed(request, revision = 1) {
  const events = ["09-21", "09-22", "12-15"].map(date => ({
    id: date, summary: `Activity ${date} revision ${revision}`, calendarId: "office", calendarName: "Office",
    start: { dateTime: `2026-${date}T09:00:00+08:00` }, end: { dateTime: `2026-${date}T10:00:00+08:00` },
  })).filter(event => Date.parse(event.start.dateTime) >= Date.parse(request.from) && Date.parse(event.start.dateTime) < Date.parse(request.to));
  return { calendar: { id: "office", summary: "Office" }, events };
}

test("Dashboard renders before annual loading and other menus share the in-progress annual request", async ({ page }) => {
  await setup(page);
  const requests = [];
  let release;
  const annualGate = new Promise(resolve => { release = resolve; });
  let dashboardAtAnnualStart;
  await page.route("**/api/calendar-feed", async route => {
    const request = route.request().postDataJSON();
    requests.push(request);
    if (request.from.includes("-01-01")) {
      dashboardAtAnnualStart = await page.locator("#metricEvents").textContent();
      await annualGate;
    }
    await route.fulfill({ json: feed(request) });
  });
  await page.goto("/");
  await expect(page.locator("#metricEvents")).toHaveText("2");
  await expect(page.locator("#backgroundStatus")).toContainText("Preparing 2026");
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0]).toMatchObject({ from: "2026-09-01T00:00:00+08:00", to: "2026-10-01T00:00:00+08:00" });
  expect(dashboardAtAnnualStart).toBe("2");
  await expect(page.locator("#dashboard")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#nextBtn")).toBeEnabled();
  // The current month remains usable while the wider annual request is held.
  for (const [view, count] of [["Today", "1"], ["Week", "2"], ["Month", "2"], ["Dashboard", "2"]]) {
    await page.locator(".nav").getByRole("button", { name: view, exact: true }).click();
    await expect(page.locator("#metricEvents")).toHaveText(count);
    await expect(page.locator("#dashboard")).toHaveAttribute("aria-busy", "false");
  }
  await page.getByRole("button", { name: "Calendar View", exact: true }).click();
  await expect(page.locator("#calendarMonthCount")).toHaveText("2 activities");
  expect(requests).toHaveLength(2);
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator("#agenda .skeleton").first()).toBeVisible();
  expect(requests).toHaveLength(2);
  release();
  await expect(page.locator("#metricEvents")).toHaveText("3");
  for (const [view, count] of [["Dashboard", "2"], ["Week", "2"], ["Month", "2"], ["Today", "1"]]) {
    await page.getByRole("button", { name: view, exact: true }).first().click();
    await expect(page.locator("#metricEvents")).toHaveText(count);
  }
  expect(requests).toHaveLength(2);
});

test("failed annual prefetch leaves Dashboard usable and retries on Year navigation", async ({ page }) => {
  await setup(page);
  let annualRequests = 0;
  await page.route("**/api/calendar-feed", route => {
    const request = route.request().postDataJSON();
    if (request.from.includes("-01-01") && ++annualRequests === 1)
      return route.fulfill({ status: 503, json: { error: "Temporary failure" } });
    return route.fulfill({ json: feed(request) });
  });
  await page.goto("/");
  await expect(page.locator("#backgroundStatus")).toContainText("will retry");
  await expect(page.locator("#metricEvents")).toHaveText("2");
  await expect(page.locator("#dashboard")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator("#metricEvents")).toHaveText("3");
  expect(annualRequests).toBe(2);
});

test("Refresh prevents an older background response from restoring stale annual data", async ({ page }) => {
  await setup(page);
  let revision = 1, release;
  const oldAnnual = new Promise(resolve => { release = resolve; });
  let annualRequests = 0;
  await page.route("**/api/calendar-feed", async route => {
    const request = route.request().postDataJSON(), current = revision;
    if (request.from.includes("-01-01")) {
      annualRequests++;
      if (current === 1) await oldAnnual;
    }
    await route.fulfill({ json: feed(request, current) }).catch(() => {});
  });
  await page.goto("/");
  await expect.poll(() => annualRequests).toBe(1);
  revision = 2;
  await page.getByRole("button", { name: "Refresh calendars" }).click();
  await expect(page.locator("#agenda")).toContainText("revision 2");
  await expect(page.locator("#backgroundStatus")).toContainText("ready for other views");
  release();
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator("#metricEvents")).toHaveText("3");
  await expect(page.locator("#agenda")).not.toContainText("revision 1");
  expect(annualRequests).toBe(2);
});
