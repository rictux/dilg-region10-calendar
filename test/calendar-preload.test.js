import test from "node:test";
import assert from "node:assert/strict";
import { createCalendarPreloader } from "../calendar-preload.js";

test("preload is encrypted, deduplicated, portable, expiring, and tamper resistant", async () => {
  let stamp = Date.parse("2026-10-07T00:00:00Z");
  let calls = 0;
  const options = {
    getSecret: () => "test-server-secret", now: () => stamp,
    readLinks: async () => [{ name: "Confidential office", link: "calendar-link" }],
    readFeed: async (link, from, to) => {
      calls++;
      assert.equal(from.toISOString(), "2025-12-31T16:00:00.000Z");
      assert.equal(to.toISOString(), "2026-12-31T16:00:00.000Z");
      return { events: [{ summary: "Confidential activity" }] };
    },
  };
  const preloader = createCalendarPreloader(options);
  const [a, b] = await Promise.all([preloader.prepare(), preloader.prepare()]);
  assert.equal(a, b);
  assert.equal(calls, 1);
  assert.doesNotMatch(Buffer.from(a, "base64url").toString(), /Confidential/);
  const otherInstance = createCalendarPreloader(options);
  assert.equal(otherInstance.open(a).feeds[0].data.events[0].summary, "Confidential activity");
  const damaged = Buffer.from(a, "base64url"); damaged[40] ^= 1;
  assert.throws(() => otherInstance.open(damaged.toString("base64url")));
  assert.throws(() => createCalendarPreloader({ ...options, getSecret: () => "wrong" }).open(a));
  stamp += 5 * 60000 + 1;
  assert.throws(() => otherInstance.open(a), /Expired/);
});

test("one failed feed does not discard successfully preloaded feeds", async () => {
  const preloader = createCalendarPreloader({
    getSecret: () => "test", readLinks: async () => [{ link: "good" }, { link: "bad" }],
    readFeed: async link => { if (link === "bad") throw new Error("upstream internals"); return { events: [] }; },
  });
  const data = preloader.open(await preloader.prepare());
  assert.deepEqual(data.feeds[0].data, { events: [] });
  assert.ok(data.feeds[1].error);
  assert.doesNotMatch(JSON.stringify(data), /upstream internals/);
});
