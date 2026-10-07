import test from "node:test";
import assert from "node:assert/strict";
import app from "../server.js";

test("calendar viewing needs no access token; saving still requires an add code", async t => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + "/api/calendar-feed", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal(response.status, 400); // Date validation, not an authentication rejection.
  const save = await fetch(base + "/api/calendar-links", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Office", link: "https://calendar.google.com/calendar/embed?src=test@example.com" }),
  });
  assert.equal(save.status, 400);
  assert.match((await save.json()).error, /Add Link code/);
  assert.equal((await fetch(base + "/api/access", { method: "POST" })).status, 404);
});
