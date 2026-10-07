import test from "node:test";
import assert from "node:assert/strict";
import { fetchCalendarLinks } from "../calendar-links.js";
import app, { accessControl } from "../server.js";

const row = {
  id: "6f8c730b-7936-4975-9102-21a9e9258949",
  name: "Office from database",
  link: "https://calendar.google.com/calendar/embed?src=office%40example.com",
};
const options = { url: "https://supabase.example.com", key: "sb_publishable_test" };

test("queries the custom schema using a publishable key and returns only calendar fields", async () => {
  const rows = await fetchCalendarLinks({ ...options, fetchImpl: async (url, init) => {
    assert.equal(url.origin, options.url);
    assert.equal(url.pathname, "/rest/v1/calendar_links");
    assert.equal(url.searchParams.get("select"), "id,name,link");
    assert.equal(url.searchParams.get("limit"), "16");
    assert.equal(init.headers["Accept-Profile"], "system_calendar");
    assert.equal(init.headers.apikey, options.key);
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.redirect, "error");
    return Response.json([{ ...row, unexpected: "not forwarded" }]);
  } });
  assert.deepEqual(rows, [row]);
});

test("legacy anon JWT is sent as both apikey and bearer token", async () => {
  await fetchCalendarLinks({ ...options, key: "legacy-anon-jwt", fetchImpl: async (_, init) => {
    assert.equal(init.headers.Authorization, "Bearer legacy-anon-jwt");
    return Response.json([]);
  } });
});

test("missing configuration or insecure remote URLs do not make a request", async () => {
  const fetchImpl = () => { throw new Error("Unexpected network request"); };
  await assert.rejects(fetchCalendarLinks({ url: "", key: "", fetchImpl }), /not configured/);
  await assert.rejects(fetchCalendarLinks({ ...options, url: "http://remote.example", fetchImpl }), /HTTPS/);
});

test("API errors do not leak upstream response bodies", async () => {
  await assert.rejects(fetchCalendarLinks({ ...options, fetchImpl: async () =>
    new Response("sensitive upstream body", { status: 401 }) }), (error) => {
    assert.match(error.message, /HTTP 401/);
    assert.doesNotMatch(error.message, /sensitive/);
    return true;
  });
});

test("invalid records, private links, duplicates, and excessive lists are rejected", async () => {
  for (const rows of [
    {},
    [{ ...row, name: " " }],
    [{ ...row, link: "https://evil.example.com" }],
    [{ ...row, link: "https://calendar.google.com/calendar/ical/office%40example.com/private-abc/basic.ics" }],
    [row, { ...row, link: "https://calendar.google.com/calendar/u/0?cid=office@example.com" }],
    Array(16).fill(row),
  ]) {
    await assert.rejects(fetchCalendarLinks({ ...options, fetchImpl: async () => Response.json(rows) }));
  }
});

test("empty table returns an empty list", async () => {
  assert.deepEqual(await fetchCalendarLinks({ ...options, fetchImpl: async () => Response.json([]) }), []);
});

test("HTTP endpoint returns database records and hides upstream failures", async (t) => {
  t.mock.method(accessControl, "require", (req, res, next) => next());
  const originalUrl = process.env.supabase_url;
  const originalKey = process.env.supabase_publishable_key;
  process.env.supabase_url = options.url;
  process.env.supabase_publishable_key = options.key;
  t.after(() => {
    if (originalUrl === undefined) delete process.env.supabase_url;
    else process.env.supabase_url = originalUrl;
    if (originalKey === undefined) delete process.env.supabase_publishable_key;
    else process.env.supabase_publishable_key = originalKey;
  });
  const nativeFetch = globalThis.fetch;
  let status = 200;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url.origin, options.url);
    assert.equal(init.headers.apikey, options.key);
    return status === 200 ? Response.json([row]) : new Response("upstream secret", { status });
  });
  t.mock.method(console, "error", () => {});
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/calendar-links`;
  const response = await nativeFetch(endpoint);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { calendars: [row] });
  status = 401;
  const failure = await nativeFetch(endpoint);
  assert.equal(failure.status, 503);
  const body = await failure.text();
  assert.doesNotMatch(body, /upstream secret|sb_publishable_test/);
});
