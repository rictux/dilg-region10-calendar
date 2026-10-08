import { test, expect } from "./fixtures.js";

const link = "https://calendar.google.com/calendar/embed?src=office%40example.com";
async function mockCalendar(page) {
  const counters = { requests: 0, revision: 1, name: "Office", fail: false };
  await page.clock.install({ time: new Date("2026-09-22T04:00:00Z") });
  await page.route("**/api/calendar-links", route => route.fulfill({ json: {
    calendars: [{ name: counters.name, link }],
  } }));
  await page.route("**/api/calendar-feed", route => {
    counters.requests++;
    if (counters.fail) return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    return route.fulfill({ json: { calendar: { id: "office@example.com", summary: "Google name" },
      events: ["01-15", "09-22"].map(date => ({ id: date, summary: `Meeting ${date} revision ${counters.revision}`,
        calendarId: "office@example.com", calendarName: "Google name", location: "Conference room",
        start: { dateTime: `2026-${date}T09:00:00+08:00` }, end: { dateTime: `2026-${date}T10:00:00+08:00` } })) } });
  });
  return counters;
}

test("browser cache survives reloads, updates office names, expires, and supports forced refresh", async ({ page }) => {
  const counters = await mockCalendar(page);
  const workers = [];
  page.on("worker", worker => workers.push(worker.url()));
  await page.goto("/");
  await expect(page.locator("#agenda")).toContainText("revision 1");
  expect(workers.some(url => url.endsWith("/calendar-worker.js"))).toBe(true);
  for (const view of ["Week", "Month", "Year", "Today"]) {
    await page.getByRole("button", { name: view, exact: true }).first().click();
    await expect(page.locator("#dashboard")).toHaveAttribute("aria-busy", "false");
  }
  expect(counters.requests).toBe(2);
  counters.name = "Renamed Office";
  await page.reload();
  await expect(page.locator("#agenda")).toContainText("Renamed Office");
  await expect(page.locator("#backgroundStatus")).toContainText("ready for other views");
  expect(counters.requests).toBe(2);
  counters.revision = 2;
  await page.clock.fastForward(5 * 60000 + 1000);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator("#agenda")).toContainText("revision 2");
  expect(counters.requests).toBe(3);
  counters.revision = 3;
  await page.getByRole("button", { name: "Refresh calendars" }).click();
  await expect(page.locator("#agenda")).toContainText("revision 3");
  expect(counters.requests).toBe(4);
  counters.fail = true;
  await page.getByRole("button", { name: "Refresh calendars" }).click();
  await expect(page.locator("#agenda")).toContainText("Calendar data unavailable");
  counters.fail = false;
  counters.revision = 4;
  await page.reload();
  await expect(page.locator("#agenda")).toContainText("revision 4");
  await expect(page.locator("#backgroundStatus")).toContainText("ready for other views");
  expect(counters.requests).toBe(7);
});

test("corrupt persisted feeds are ignored and fetched again", async ({ page }) => {
  const counters = await mockCalendar(page);
  await page.goto("/");
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await expect(page.locator("#backgroundStatus")).toContainText("ready for other views");
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("calendar-dashboard-cache", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction("feeds", "readwrite");
      const store = transaction.objectStore("feeds"), rows = store.getAll();
      rows.onsuccess = () => rows.result.forEach(row => store.put({ ...row, data: { broken: true } }));
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  counters.revision = 2;
  await page.reload();
  await expect(page.locator("#agenda")).toContainText("revision 2");
  await expect(page.locator("#backgroundStatus")).toContainText("ready for other views");
  expect(counters.requests).toBe(4);
});

test("blocked storage and unavailable workers retain normal calendar behavior", async ({ page }) => {
  const counters = await mockCalendar(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { get() { throw new Error("Storage blocked"); } });
    window.Worker = class { constructor() { throw new Error("Worker blocked"); } };
  });
  await page.goto("/");
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator("#metricEvents")).toHaveText("2");
  counters.revision = 2;
  await page.reload();
  await expect(page.locator("#agenda")).toContainText("revision 2");
  await expect(page.locator("#backgroundStatus")).toContainText("ready for other views");
  expect(counters.requests).toBe(4);
});

test("worker script failure falls back without leaving loading placeholders", async ({ page }) => {
  await mockCalendar(page);
  await page.route("**/calendar-worker.js", route => route.abort());
  await page.goto("/");
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator("#metricEvents")).toHaveText("2");
  await expect(page.locator("#dashboard")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".skeleton")).toHaveCount(0);
});

test("navigation stays responsive and late worker results cannot replace a newer view", async ({ page }) => {
  await mockCalendar(page);
  await page.addInitScript(() => {
    window.heldReplies = [];
    window.holdAnalysis = false;
    const BrowserWorker = window.Worker;
    window.Worker = class extends BrowserWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", event => {
          if (!window.holdAnalysis || window.heldReplies.length) return;
          event.stopImmediatePropagation();
          window.heldReplies.push(() => this.dispatchEvent(new MessageEvent("message", { data: event.data })));
        });
      }
    };
  });
  await page.goto("/");
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await page.evaluate(() => { window.holdAnalysis = true; });
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator('[data-view="year"]')).toHaveClass("active");
  await expect(page.locator("#agenda .skeleton").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.heldReplies.length)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Today", exact: true }).first().click();
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await page.evaluate(() => {
    window.holdAnalysis = false;
    window.heldReplies.splice(0).forEach(deliver => deliver());
  });
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.locator("#metricEvents")).toHaveText("1");
  await expect(page.locator("#pageTitle")).toHaveText("Weekly activity");
  await expect(page.locator("#dashboard")).toHaveAttribute("aria-busy", "false");
});
