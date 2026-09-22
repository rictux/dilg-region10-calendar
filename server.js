import express from "express";
import { fileURLToPath } from "node:url";
import { fetchCalendar } from "./calendar.js";

export const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
  });
  next();
});
app.use(express.json({ limit: "8kb" }));
let activeRequests = 0;
app.post("/api/calendar-feed", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.get("sec-fetch-site") === "cross-site")
    return res
      .status(403)
      .json({ error: "Cross-site requests are not allowed." });
  const from = new Date(req.body?.from),
    to = new Date(req.body?.to);
  if (
    !Number.isFinite(+from) ||
    !Number.isFinite(+to) ||
    to <= from ||
    to - from > 100 * 86400000
  )
    return res
      .status(400)
      .json({ error: "Provide a date range of at most 100 days." });
  if (activeRequests >= 20)
    return res
      .status(429)
      .json({ error: "Server is busy. Please try again shortly." });
  activeRequests++;
  try {
    res.json(await fetchCalendar(req.body?.url, from, to));
  } catch (error) {
    res
      .status(400)
      .json({
        error:
          error.name === "TimeoutError"
            ? "Google Calendar timed out. Please retry."
            : error.message === "fetch failed"
              ? "Could not reach Google Calendar. Please retry."
              : error.message,
      });
  } finally {
    activeRequests--;
  }
});
app.use(
  express.static(fileURLToPath(new URL("./public", import.meta.url)), {
    dotfiles: "deny",
  }),
);
app.use((error, req, res, next) =>
  res
    .status(error.status || 500)
    .json({
      error:
        error.status === 413 ? "Request is too large." : "Invalid request.",
    }),
);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`Calendar dashboard: http://localhost:${port}`),
  );
}
