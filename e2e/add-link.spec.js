import { test, expect } from "./fixtures.js";

test("Add Link asks for its own code at save and refreshes the calendars", async ({ page }) => {
  const calendars = [{ id: "1", name: "Existing Office", link: "https://calendar.google.com/calendar/embed?src=existing%40example.com" }];
  let saves = 0;
  await page.route("**/api/calendar-links", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { calendars } });
    const body = route.request().postDataJSON();
    expect(route.request().headers().authorization).toBe("Bearer test-page-token");
    if (body.code !== "test-add-code") return route.fulfill({ status: 403, json: { error: "Incorrect Add Link code. Please try again." } });
    calendars.push({ id: "2", name: body.name, link: body.link });
    saves++;
    return route.fulfill({ status: 201, json: { saved: true } });
  });
  await page.route("**/api/calendar-feed", route => route.fulfill({ json: { calendar: { id: route.request().postDataJSON().url, summary: "Google title" }, events: [] } }));
  await page.goto("/");
  await expect(page.locator("#sideStatus")).toHaveText("1 of 1 calendars loaded");
  await page.getByRole("button", { name: "Add Link", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Link" });
  await dialog.getByLabel("Name", { exact: true }).fill("New Office");
  await dialog.getByLabel("Link", { exact: true }).fill("https://calendar.google.com/calendar/embed?src=new%40example.com");
  await expect(dialog.getByLabel("Input Add Link Auth Code:")).toBeHidden();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  expect(saves).toBe(0);
  await dialog.getByLabel("Input Add Link Auth Code:").fill("test-access-code");
  await dialog.getByRole("button", { name: "Confirm & save" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Incorrect Add Link code");
  await expect(page.locator("#calendarApp")).toBeVisible();
  expect(saves).toBe(0);
  await dialog.getByLabel("Input Add Link Auth Code:").fill("test-add-code");
  await dialog.getByRole("button", { name: "Confirm & save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#sideStatus")).toHaveText("2 of 2 calendars loaded");
  expect(saves).toBe(1);
  await page.locator("#calFilter").click();
  await expect(page.locator("#calendarList")).toContainText("New Office");
});
