import { test, expect } from "@playwright/test";

test("updated details, strict formats and office filters", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-09-22T04:00:00Z") });
  await page.route("**/api/calendar-feed", (route) => {
    const { url } = route.request().postDataJSON();
    const first = url.includes("dilg.lgmed10");
    const second = url.includes("rtenplanning");
    const office = first ? "LGMED" : "Planning";
    const events = first
      ? [
          {
            id: "complete",
            summary: "Regional coordination meeting",
            location: "Zoom",
            description:
              'Meeting ID: 123 456 7890<br>Passcode: abc123<br>Activity focal: Jane Doe.<br>Host agency: DILG.<br>Staff involved: Alex Cruz.<br>Participants: 25 pax.<br>Speaker: Pat Reyes.<br><a href="https://docs.google.com/spreadsheets/d/example">LGRC Activity Tracker</a><br><a href="javascript:alert(1)">Unsafe</a><a href="https://example.com/goog_123456">Placeholder</a>',
          },
          {
            id: "partial",
            summary: "Data management workshop",
            location: "Zoom",
            description:
              "Meeting ID: 123 456 7890. Speaker: Pat Reyes. https://zoom.us/j/1234567890",
            htmlLink: "https://calendar.google.com/calendar/event?eid=example",
          },
        ]
      : second
        ? [
            {
              id: "hybrid",
              summary: "Planning review",
              location: "Conference room",
              description: "Meeting ID: 987 654 3210. Passcode: xyz789",
            },
          ]
        : [];
    return route.fulfill({
      json: {
        calendar: { id: url, summary: office },
        events: events.map((e) => ({
          ...e,
          calendarId: url,
          calendarName: office,
          start: { dateTime: "2026-09-22T01:00:00Z" },
          end: { dateTime: "2026-09-22T02:00:00Z" },
        })),
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("#sideStatus")).toHaveText(
    "7 of 7 calendars loaded",
  );
  await expect(page.locator("#metricEvents")).toHaveText("3");
  await expect(page.locator("#conflicts")).toContainText("Shared facilitator");
  const complete = page
    .locator(".event-wrap")
    .filter({ hasText: "Regional coordination meeting" });
  await complete.locator("summary").click();
  await expect(complete.locator(".pill.online")).toHaveText("Online");
  await expect(complete).toContainText("Jane Doe");
  await expect(complete).toContainText("Alex Cruz");
  await expect(complete).toContainText("25 pax");
  await expect(
    complete.getByRole("link", { name: "LGRC Activity Tracker" }),
  ).toHaveAttribute("href", "https://docs.google.com/spreadsheets/d/example");
  await expect(
    page.locator(
      'a[href^="javascript:"], a[href*="goog_123456"], .event-extra a[href*="calendar/event"]',
    ),
  ).toHaveCount(0);
  await page.locator("#modeFilter").selectOption("Online");
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await page.locator("#modeFilter").selectOption("Hybrid");
  await expect(page.locator("#agenda")).toContainText("Planning review");
  await page.locator("#modeFilter").selectOption("Unspecified");
  await expect(page.locator("#agenda")).toContainText(
    "Data management workshop",
  );
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await page.locator("#modeFilter").selectOption("all");
  const planning = page.locator('[data-office="Planning"]');
  await planning.click();
  await expect(planning).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await planning.click();
  await expect(page.locator("#metricEvents")).toHaveText("3");
  await expect(page.locator("#exportBtn, #connectBtn, #linkBtn")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/updated-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
