import { test, expect } from "./fixtures.js";

test("multi-day activities are listed under each day they run", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-07T04:00:00Z") });
  await page.route("**/api/calendar-feed", (route) => {
    const request = route.request().postDataJSON();
    const events = request.url.includes("dilg.lgmed10")
      ? [
          {
            id: "campaign",
            summary: "Month-long campaign",
            start: { date: "2026-09-20" },
            end: { date: "2026-10-31" },
          },
          {
            id: "seminar",
            summary: "Regional LGU Seminar",
            start: { date: "2026-10-06" },
            end: { date: "2026-10-09" },
          },
          {
            id: "meeting",
            summary: "Staff meeting",
            start: { dateTime: "2026-10-06T09:00:00+08:00" },
            end: { dateTime: "2026-10-06T11:00:00+08:00" },
          },
          {
            id: "midnight",
            summary: "Evening review",
            start: { dateTime: "2026-10-06T19:00:00+08:00" },
            end: { dateTime: "2026-10-07T00:00:00+08:00" },
          },
          {
            id: "workshop",
            summary: "Two-day workshop",
            start: { dateTime: "2026-10-12T08:00:00+08:00" },
            end: { dateTime: "2026-10-13T17:00:00+08:00" },
          },
        ].map((e) => ({ ...e, calendarId: request.url, calendarName: "LGMED" }))
      : [];
    return route.fulfill({
      json: { calendar: { id: request.url, summary: "LGMED" }, events },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  // Totals still count each activity once.
  await expect(page.locator("#metricEvents")).toHaveText("5");
  await expect(page.locator("#agendaCount")).toHaveText("5 activities");

  const group = (title) =>
    page.locator("#agenda .day-group").filter({
      has: page.locator(".day-title strong", {
        hasText: new RegExp(", " + title + "$"),
      }),
    });
  await expect(page.locator("#agenda .day-title strong")).toHaveText([
    "Thursday, October 1",
    "Tuesday, October 6",
    "Wednesday, October 7",
    "Thursday, October 8",
    "Monday, October 12",
    "Tuesday, October 13",
  ]);

  // A long activity is listed once, on the first day of the period.
  await expect(
    page.locator("#agenda .event-title", { hasText: "Month-long campaign" }),
  ).toHaveCount(1);
  await expect(group("October 1")).toContainText("Ongoing · Sep 20 – Oct 30");

  await expect(group("October 6")).toContainText(
    "Day 1 of 3 · Oct 6–8All day",
  );
  await expect(group("October 7")).toContainText("Day 2 of 3 · Oct 6–8");
  await expect(group("October 8")).toContainText("Day 3 of 3 · Oct 6–8");
  // Ending at midnight keeps an activity on its start day.
  await expect(group("October 6")).toContainText("Evening review");
  await expect(group("October 7")).not.toContainText("Evening review");

  await expect(group("October 12")).toContainText(
    "Day 1 of 2 · Oct 12–13from 8:00",
  );
  await expect(group("October 13")).toContainText(
    "Day 2 of 2 · Oct 12–13until 5:00",
  );

  // The busiest day counts activities still running that day.
  await expect(page.locator("body")).toContainText(
    "Tuesday, October 6 is the busiest day with 3 activities.",
  );

  // Day view on the middle day lists the seminar under that date.
  await page.locator('[data-view="day"]').click();
  await expect(page.locator("#agenda .day-title strong")).toHaveText([
    "Wednesday, October 7",
  ]);
  await expect(page.locator("#agenda")).toContainText("Day 2 of 3 · Oct 6–8");
  expect(errors).toEqual([]);
});
