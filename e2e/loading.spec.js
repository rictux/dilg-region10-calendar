import { test, expect } from "./fixtures.js";

for (const view of ["Today", "Week", "Month", "Year"]) {
  test(`${view} shows skeletons until the requested period settles`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-12-31T04:00:00Z") });
    let release;
    let pending = new Promise((resolve) => { release = resolve; });
    let fail = false;
    await page.route("**/api/calendar-feed", async (route) => {
      await pending;
      const { url } = route.request().postDataJSON();
      await route.fulfill(fail
        ? { status: 502, json: { error: "Calendar unavailable" } }
        : { json: { calendar: { id: url, summary: "Test office" }, events: [] } });
    });
    await page.goto("/");
    await expect(page.locator("#dashboard")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("#metricEvents .skeleton")).toBeVisible();
    await expect(page.locator("#agenda")).not.toContainText("Your schedule is clear");
    release();
    await expect(page.locator("#dashboard")).toHaveAttribute("aria-busy", "false");
    await page.getByRole("button", { name: view, exact: true }).first().click();
    await expect(page.locator("#nextBtn")).toBeEnabled();
    pending = new Promise((resolve) => { release = resolve; });
    await page.locator("#nextBtn").click();
    await expect(page.locator("#dashboard")).toHaveAttribute("aria-busy", "true");
    for (const id of ["metricEvents", "summaryLead", "breakdown", "analytics", "officeTiles", "stakeholders", "conflicts", "agenda", "suggestions"])
      await expect(page.locator(`#${id} .skeleton`).first()).toBeVisible();
    await expect(page.locator("#nextBtn")).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("#metricEvents .skeleton")).toHaveCSS("animation-name", "none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (view === "Year") fail = true;
    release();
    await expect(page.locator("#dashboard")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator(".skeleton")).toHaveCount(0);
    await expect(page.locator("#agenda")).toContainText(view === "Year" ? "Calendar data unavailable" : "Your schedule is clear");
  });
}
