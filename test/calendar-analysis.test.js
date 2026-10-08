import test from "node:test";
import assert from "node:assert/strict";
import { groupDuplicates, findOverlaps } from "../public/calendar-analysis.js";

const activity = (overrides = {}) => ({ calendarId: "a", summary: "Regional coordination meeting",
  day: "2026-09-22", start: 100000, end: 200000, allDay: false, venue: "Regional office",
  facilitators: [], participants: [], contacts: [], ...overrides });

test("duplicate groups preserve same-calendar activities, day boundaries, and transitive matches", () => {
  assert.deepEqual(groupDuplicates([activity(), activity()]), [[0], [1]]);
  assert.deepEqual(groupDuplicates([activity(), activity({ calendarId: "b" }), activity({ calendarId: "c" })]), [[0, 1, 2]]);
  assert.deepEqual(groupDuplicates([activity(), activity({ calendarId: "b", day: "2026-09-23", start: 86500000 })]), [[0], [1]]);
  assert.deepEqual(groupDuplicates([activity(), activity({ calendarId: "b", summary: "Procurement documents submission" })]), [[0], [1]]);
});

test("overlaps exclude all-day events and touching endpoints and retain shared people", () => {
  const events = [activity({ facilitators: ["alex"] }), activity({ start: 150000, facilitators: ["alex"] }),
    activity({ start: 200000, end: 300000 }), activity({ allDay: true })];
  assert.deepEqual(findOverlaps(events), [{ a: 0, b: 1, start: 150000, end: 200000,
    sharedFac: ["alex"], sharedPart: [], basis: "Shared facilitator" }]);
});

test("sorted overlap scan matches exhaustive comparisons across varied intervals", () => {
  let seed = 23;
  const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const events = Array.from({ length: 300 }, () => {
    const start = Math.floor(random() * 10000000);
    return activity({ start, end: start + Math.floor(random() * 300000), allDay: random() < 0.1 });
  });
  const expected = [];
  for (let i = 0; i < events.length; i++) for (let j = i + 1; j < events.length; j++) {
    const a = events[i], b = events[j];
    if (!a.allDay && !b.allDay && a.start < b.end && b.start < a.end) expected.push(`${i}:${j}`);
  }
  const actual = findOverlaps(events).map(pair => [pair.a, pair.b].sort((a, b) => a - b).join(":"));
  assert.deepEqual(actual.sort(), expected.sort());
});
