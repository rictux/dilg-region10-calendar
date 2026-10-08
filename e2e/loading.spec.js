import { test, expect } from "./fixtures.js";

test("Year navigation highlights immediately with loading or cached annual results", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-22T04:00:00Z") });
  let requests = 0;
  await page.route("**/api/calendar-feed", route => {
    requests++;
    const { url } = route.request().postDataJSON();
    const events = url.includes("dilg.lgmed10") ? ["01-15", "09-22"].map(date => ({
      id: date, summary: `Office meeting ${date}`, calendarId: url, calendarName: "LGMED",
      start: { dateTime: `2026-${date}T09:00:00+08:00` },
      end: { dateTime: `2026-${date}T10:00:00+08:00` },
    })) : [];
    return route.fulfill({ json: { calendar: { id: url, summary: "Office" }, events } });
  });
  await page.goto("/");
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await expect(page.locator("#backgroundStatus")).toContainText("ready for other views");
  const initialRequests = requests;
  for (const from of ["Today", "Week", "Month"]) {
    await page.getByRole("button", { name: from, exact: true }).first().click();
    await expect(page.locator("#nextBtn")).toBeEnabled();
    // Observe the next browser frame, not just the final DOM after click completes.
    await page.evaluate(() => {
      const year = document.querySelector('[data-view="year"]');
      window.yearLoadingFrame = new Promise(resolve => {
        year.addEventListener("click", () => requestAnimationFrame(() => resolve({
          selected: year.classList.contains("active"),
          busy: document.querySelector("#dashboard").getAttribute("aria-busy"),
          skeleton: !!document.querySelector("#agenda .skeleton"),
          title: document.querySelector("#pageTitle").textContent,
        })), { once: true });
      });
    });
    await page.getByRole("button", { name: "Year", exact: true }).click();
    const frame = await page.evaluate(() => window.yearLoadingFrame);
    expect(frame).toMatchObject({ selected: true, title: "Annual activity summary" });
    expect(frame.skeleton).toBe(frame.busy === "true");
    await expect(page.locator("#metricEvents")).toHaveText("2");
    await expect(page.locator("#dashboard")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator(".skeleton")).toHaveCount(0);
    expect(requests).toBe(initialRequests);
  }
});

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
