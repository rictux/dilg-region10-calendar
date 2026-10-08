import test from "node:test";
import assert from "node:assert/strict";
import { CalendarCache, CALENDAR_CACHE_TTL, validCalendarFeed } from "../public/calendar-cache.js";

const feed = { calendar: { id: "office" }, events: [{ id: "a", calendarId: "office", summary: "Meeting",
  start: { date: "2026-09-22" }, end: { date: "2026-09-23" } }] };
const range = { from: "2026-01-01", to: "2027-01-01" };

test("cache validates stored data and rejects expired or future timestamps", () => {
  const cache = new CalendarCache();
  const record = { savedAt: Date.now(), bytes: 200, data: feed };
  assert.equal(cache.fresh(record), true);
  assert.equal(cache.fresh({ ...record, savedAt: Date.now() - CALENDAR_CACHE_TTL }), false);
  assert.equal(cache.fresh({ ...record, savedAt: Date.now() + 60000 }), false);
  assert.equal(validCalendarFeed(feed), true);
  assert.equal(validCalendarFeed({ ...feed, events: [{ ...feed.events[0], attendees: "invalid" }] }), false);
  assert.equal(validCalendarFeed({ ...feed, events: [{ ...feed.events[0], start: {} }] }), false);
});

test("memory fallback isolates cached responses from display mutations and bounds entries", async () => {
  const cache = new CalendarCache();
  cache.database = Promise.resolve(null);
  await cache.put("office", range, feed);
  const first = await cache.get("office", range);
  first.data.events[0].summary = "Changed for display";
  assert.equal((await cache.get("office", range)).data.events[0].summary, "Meeting");
  for (let i = 0; i < 35; i++) await cache.put(`office-${i}`, range, feed);
  assert.equal(cache.memory.size, 30);
  assert.equal(await cache.get("office", range), null);
  await cache.remove("office-34", range);
  assert.equal(await cache.get("office-34", range), null);
  assert.equal(await cache.get("office-33", { ...range, from: "2025-01-01" }), null);
  await cache.clear();
  assert.equal(cache.memory.size, 0);
  assert.equal(await cache.get("office-33", range), null);
});
