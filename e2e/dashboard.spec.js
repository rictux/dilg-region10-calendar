import { test, expect } from "@playwright/test";

test("live calendars, navigation and responsive layout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#sideStatus")).toHaveText(
    /^[1-7] of 7 calendars loaded$/,
    { timeout: 45000 },
  );
  const loadedCount = Number(
    (await page.locator("#sideStatus").textContent()).split(" ")[0],
  );
  await expect(page.locator(".source-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator("#pageTitle")).toHaveText("Monthly activity");
  await page.locator("#calFilter").click();
  await expect(page.locator("#calendarList input")).toHaveCount(loadedCount);
  await page.locator("#calendarList input").first().uncheck();
  await expect(page.locator("#calFilter")).toHaveText(
    `${loadedCount - 1} selected ▾`,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#exportBtn, #connectBtn, #linkBtn")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Concurrent activities", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#pageTitle")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.locator("#nextBtn").click();
  await expect(page.locator("#nextBtn")).toBeEnabled({ timeout: 45000 });
  expect(errors).toEqual([]);
});

test("failed feeds show unavailable data rather than an empty schedule", async ({
  page,
}) => {
  await page.route("**/api/calendar-feed", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Calendar is not public." }),
    }),
  );
  await page.goto("/");
  await expect(page.locator("#sideStatus")).toHaveText(
    "0 of 7 calendars loaded",
  );
  await expect(page.locator("#metricEvents")).toHaveText("—");
  await expect(page.locator("#agenda")).toContainText(
    "Calendar data unavailable",
  );
  await expect(page.locator("#exportBtn, #connectBtn, #linkBtn")).toHaveCount(0);
});
