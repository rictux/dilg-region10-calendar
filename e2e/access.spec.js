import { test, expect } from "@playwright/test";

test("code prompt blocks loading, rejects a wrong code, and returns on reload", async ({ page }) => {
  await page.route("**/api/calendar-preload", route => route.fulfill({ status: 503, json: {} }));
  let requests = 0;
  await page.route("**/api/calendar-links", route => {
    requests++;
    expect(route.request().headers().authorization).toBe("Bearer test-token");
    return route.fulfill({ json: { calendars: [] } });
  });
  await page.route("**/api/access", route => route.fulfill(
    route.request().postDataJSON().code === "test-code"
      ? { json: { token: "test-token" } }
      : { status: 401, json: { error: "Incorrect Auth Code. Please try again." } }
  ));
  await page.goto("/");
  await expect(page.locator("#calendarApp")).toBeHidden();
  await expect(page.getByLabel("Input current Auth Code:")).toBeVisible();
  expect(requests).toBe(0);
  await page.getByLabel("Input current Auth Code:").fill("wrong");
  await page.getByRole("button", { name: "Open calendar" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect Auth Code");
  await expect(page.locator("#calendarApp")).toBeHidden();
  expect(requests).toBe(0);
  await page.getByLabel("Input current Auth Code:").fill("test-code");
  await page.getByRole("button", { name: "Open calendar" }).click();
  await expect(page.locator("#calendarApp")).toBeVisible();
  await expect(page.locator("#sideStatus")).toHaveText("Calendar list unavailable");
  expect(requests).toBe(1);
  await page.reload();
  await expect(page.locator("#calendarApp")).toBeHidden();
  await expect(page.getByLabel("Input current Auth Code:")).toHaveValue("");
  expect(requests).toBe(1);
});
