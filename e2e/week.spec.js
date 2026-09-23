import { test, expect } from "@playwright/test";

test("weekly view includes the full Manila week across New Year", async ({
  page,
}) => {
  const requests = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2027-01-01T04:00:00Z") });
  await page.route("**/api/calendar-feed", (route) => {
    const request = route.request().postDataJSON();
    requests.push(request);
    const events = request.url.includes("dilg.lgmed10")
      ? ["2026-12-27", "2026-12-28", "2027-01-01", "2027-01-03", "2027-01-04"]
          .map((date) => ({
            id: date,
            summary: `Activity ${date}`,
            calendarId: request.url,
            calendarName: "LGMED",
            start: { dateTime: `${date}T00:00:00+08:00` },
            end: { dateTime: `${date}T01:00:00+08:00` },
          }))
          .filter(
            (event) =>
              Date.parse(event.start.dateTime) >= Date.parse(request.from) &&
              Date.parse(event.start.dateTime) < Date.parse(request.to),
          )
      : [];
    return route.fulfill({
      json: { calendar: { id: request.url, summary: "LGMED" }, events },
    });
  });
  await page.goto("/");
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.locator("#metricEvents")).toHaveText("3");
  await expect(page.locator("#pageTitle")).toHaveText("Weekly activity");
  await expect(page.locator("#summaryMode")).toHaveText("Weekly summary");
  await expect(page.locator("#agendaTitle")).toHaveText(
    "All weekly activities",
  );
  expect(requests.at(-1)).toMatchObject({
    from: "2026-12-28T00:00:00+08:00",
    to: "2027-01-04T00:00:00+08:00",
  });
  await expect(page.locator("#agenda")).toContainText("Activity 2026-12-28");
  await expect(page.locator("#agenda")).toContainText("Activity 2027-01-03");
  await expect(page.locator("#agenda")).not.toContainText(
    "Activity 2027-01-04",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/weekly-mobile.png",
    fullPage: true,
  });
  await page.locator("#nextBtn").click();
  await expect(page.locator("#metricEvents")).toHaveText("1");
  expect(requests.at(-1)).toMatchObject({
    from: "2027-01-01T00:00:00+08:00",
    to: "2028-01-01T00:00:00+08:00",
  });
  const count = requests.length;
  await page.locator("#nextBtn").click();
  await expect(page.locator("#metricEvents")).toHaveText("0");
  await expect(page.locator("#summaryMode")).toHaveText("Weekly summary");
  expect(requests).toHaveLength(count);
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator("#metricEvents")).toHaveText("3");
  expect(requests).toHaveLength(count);
  expect(errors).toEqual([]);
});
