import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAddCalendarHandler } from "../add-calendar.js";

test("saving requires the add code, validates links, and handles duplicates without writing", async (t) => {
  const writes = [];
  let existing = [];
  const app = express();
  app.use(express.json());
  app.post("/links", createAddCalendarHandler({
    verifyCode: async code => code === "test-add-code",
    readLinks: async () => existing,
    request: async (path, init) => {
      assert.equal(path, "calendar_links");
      assert.equal(init.method, "POST");
      writes.push(JSON.parse(init.body));
      return new Response(null, { status: 201 });
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/links`;
  const valid = { name: " New Office ", link: "https://calendar.google.com/calendar/embed?src=new%40example.com", code: "test-add-code" };
  const post = body => fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post({ ...valid, code: "test-access-code" })).status, 403);
  assert.equal(writes.length, 0);
  assert.equal((await post({ ...valid, name: " " })).status, 400);
  assert.equal((await post({ ...valid, link: "https://evil.example.com" })).status, 400);
  assert.equal((await post({ ...valid, link: "https://calendar.google.com/calendar/ical/new%40example.com/private-abc/basic.ics" })).status, 400);
  assert.equal(writes.length, 0);
  assert.equal((await post(valid)).status, 201);
  assert.deepEqual(writes, [{ name: "New Office", link: "https://calendar.google.com/calendar/ical/new%40example.com/public/basic.ics" }]);
  existing = [{ link: "https://calendar.google.com/calendar/u/0?cid=new@example.com" }];
  assert.equal((await post(valid)).status, 409);
  assert.equal(writes.length, 1);
  existing = Array.from({ length: 15 }, (_, i) => ({ link: `https://calendar.google.com/calendar/embed?src=office${i}@example.com` }));
  assert.equal((await post(valid)).status, 409);
  assert.equal(writes.length, 1);
});
