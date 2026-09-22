import { test, expect } from "@playwright/test";

test("annual view loads the whole Manila year and navigates between years", async ({ page }) => {
  const requests = [];
  await page.clock.install({ time: new Date("2026-09-22T04:00:00Z") });
  await page.route("**/api/calendar-feed", route => {
    const request = route.request().postDataJSON();
    requests.push(request);
    const year = Number(request.from.slice(0, 4));
    const annual = request.from.includes("-01-01");
    const events = request.url.includes("dilg.lgmed10") && year === 2026
      ? (annual ? ["01-15", "09-22", "12-15"] : ["09-22"]).map(date => ({
          id: date, summary: `LGU meeting ${date}`, calendarId: request.url,
          calendarName: "LGMED", start: { date: `2026-${date}` },
          end: { date: `2026-${date.slice(0, 3)}${Number(date.slice(3)) + 1}` },
        })) : [];
    return route.fulfill({ json: { calendar: { id: request.url, summary: "Office" }, events } });
  });
  await page.goto("/");
  await expect(page.locator("#sideStatus")).toHaveText("7 of 7 calendars loaded");
  const initialLinks = requests.map(r => r.url);
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator("#pageTitle")).toHaveText("Annual activity summary");
  await expect(page.locator("#metricEvents")).toHaveText("3");
  await expect(page.locator("#periodTitle")).toHaveText("2026");
  await expect(page.locator("#summaryMode")).toHaveText("Annual digest");
  expect(requests.slice(-7).map(r => r.url)).toEqual(initialLinks);
  expect(requests.at(-1)).toMatchObject({ from: "2026-01-01T00:00:00+08:00", to: "2027-01-01T00:00:00+08:00" });
  await expect(page.locator("#agenda")).toContainText("LGU meeting 12-15");
  await page.locator("#nextBtn").click();
  await expect(page.locator("#periodTitle")).toHaveText("2027");
  await expect(page.locator("#metricEvents")).toHaveText("0");
  await expect(page.locator("#summaryMode")).toHaveText("Annual digest");
  await page.locator("#prevBtn").click();
  await expect(page.locator("#metricEvents")).toHaveText("3");
  await page.locator("#todayBtn").click();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await expect(page.locator("#periodTitle")).toHaveText("September 2026");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Year", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
