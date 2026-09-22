import test from "node:test";
import assert from "node:assert/strict";
import { calendarSource, parseCalendar } from "../calendar.js";
import app, { app as namedApp } from "../server.js";

test("server exposes the Express handler as the default deployment export", () => {
  assert.equal(typeof app, "function");
  assert.equal(app, namedApp);
});

test("normalizes embed and base64 subscription links to the same public feed", () => {
  const id = "example@group.calendar.google.com";
  const embed = calendarSource(
    `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(id)}`,
  );
  const share = calendarSource(
    `https://calendar.google.com/calendar/u/0?cid=${Buffer.from(id).toString("base64url")}`,
  );
  assert.deepEqual(share, embed);
  assert.equal(
    embed.url,
    "https://calendar.google.com/calendar/ical/example%40group.calendar.google.com/public/basic.ics",
  );
});
test("rejects arbitrary hosts, credentials and malformed IDs", () => {
  for (const link of [
    "http://calendar.google.com/?src=a@b.com",
    "https://127.0.0.1/",
    "https://calendar.google.com.evil.test/?src=a@b.com",
    "https://user@calendar.google.com/?src=a@b.com",
    "https://calendar.google.com/?src=../secret",
    "https://calendar.google.com/?cid=invalid",
  ])
    assert.throws(() => calendarSource(link));
});
test("preserves Google secret feed path", () => {
  assert.equal(
    calendarSource(
      "https://calendar.google.com/calendar/ical/a%40gmail.com/private-abc123/basic.ics",
    ).url,
    "https://calendar.google.com/calendar/ical/a%40gmail.com/private-abc123/basic.ics",
  );
});
test("expands recurrence with exclusions, moved instances, timezone and all-day dates", async () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:Test calendar
BEGIN:VEVENT
UID:weekly
DTSTART;TZID=Asia/Manila:20260901T090000
DTEND;TZID=Asia/Manila:20260901T100000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Asia/Manila:20260908T090000
SUMMARY:Weekly meeting
END:VEVENT
BEGIN:VEVENT
UID:weekly
RECURRENCE-ID;TZID=Asia/Manila:20260915T090000
DTSTART;TZID=Asia/Manila:20260916T100000
DTEND;TZID=Asia/Manila:20260916T110000
SUMMARY:Moved meeting
END:VEVENT
BEGIN:VEVENT
UID:all-day
DTSTART;VALUE=DATE:20260921
DTEND;VALUE=DATE:20260923
SUMMARY:Two-day activity
END:VEVENT
BEGIN:VEVENT
UID:cancelled
DTSTART:20260901T000000Z
DTEND:20260901T010000Z
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;
  const result = await parseCalendar(
    ics,
    "a@gmail.com",
    new Date("2026-09-01T00:00:00+08:00"),
    new Date("2026-10-01T00:00:00+08:00"),
  );
  assert.equal(result.calendar.summary, "Test calendar");
  assert.equal(result.events.length, 4);
  assert.equal(
    result.events.find((e) => e.summary === "Moved meeting").start.dateTime,
    "2026-09-16T02:00:00.000Z",
  );
  assert.deepEqual(result.events.find((e) => e.id === "all-day").end, {
    date: "2026-09-23",
  });
});
test("API validates range and serves only public assets", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (
      await fetch(base + "/api/calendar-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    400,
  );
  assert.equal((await fetch(base + "/server.js")).status, 404);
  assert.equal((await fetch(base + "/")).status, 200);
});
