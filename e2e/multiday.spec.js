import { test, expect } from "@playwright/test";

test("multi-day activities are grouped under their full date span", async ({
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
        ].map((e) => ({ ...e, calendarId: request.url, calendarName: "LGMED" }))
      : [];
    return route.fulfill({
      json: { calendar: { id: request.url, summary: "LGMED" }, events },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator("#metricEvents")).toHaveText("3");

  const titles = page.locator("#agenda .day-title strong");
  await expect(titles).toHaveText(["Tuesday, October 6", "Tue Oct 6 – Thu Oct 8"]);
  const span = page.locator("#agenda .day-group").nth(1);
  await expect(span).toContainText("Regional LGU Seminar");
  await expect(span).not.toContainText("Staff meeting");
  // Ending at midnight keeps an activity on its start day.
  await expect(page.locator("#agenda .day-group").first()).toContainText(
    "Evening review",
  );

  // The middle day of the span still lists the activity, under its span title.
  await page.locator('[data-view="day"]').click();
  await expect(titles).toHaveText(["Tue Oct 6 – Thu Oct 8"]);
  expect(errors).toEqual([]);
});
