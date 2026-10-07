import { calendarSource } from "./calendar.js";
import { fetchCalendarLinks } from "./calendar-links.js";
import { supabaseServerRequest, verifyAddCode } from "./access.js";

export function createAddCalendarHandler({
  verifyCode = verifyAddCode,
  readLinks = fetchCalendarLinks,
  request = supabaseServerRequest,
  now = Date.now,
} = {}) {
  const attempts = new Map();
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.get("sec-fetch-site") === "cross-site") return res.status(403).json({ error: "Request not allowed." });
    const { name, link, code } = req.body || {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 200 ||
      typeof code !== "string" || !code || code.length > 1024) {
      return res.status(400).json({ error: "Enter a name, public calendar link, and Add Link code." });
    }
    let source;
    try {
      source = calendarSource(link);
      if (!source.url.endsWith("/public/basic.ics")) throw new Error();
    } catch {
      return res.status(400).json({ error: "Enter a valid public Google Calendar link. Secret iCal links cannot be saved." });
    }
    const stamp = now();
    for (const [ip, entry] of attempts) if (entry.until <= stamp) attempts.delete(ip);
    const ip = req.ip || "unknown";
    const entry = attempts.get(ip) || { count: 0, until: stamp + 60000 };
    if (entry.count >= 10 || (!attempts.has(ip) && attempts.size >= 5000)) {
      return res.set("Retry-After", "60").status(429).json({ error: "Too many attempts. Wait one minute and try again." });
    }
    entry.count++;
    attempts.set(ip, entry);
    try {
      if (!await verifyCode(code)) return res.status(403).json({ error: "Incorrect Add Link code. Please try again." });
      const existing = await readLinks();
      if (existing.some(row => calendarSource(row.link).id === source.id)) {
        return res.status(409).json({ error: "This calendar is already in the list." });
      }
      if (existing.length >= 15) return res.status(409).json({ error: "The dashboard supports at most 15 calendars." });
      // Canonical public feed URL makes equivalent new links share the UNIQUE constraint.
      const response = await request("calendar_links", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ name: name.trim(), link: source.url }),
      });
      if (response.status === 409) return res.status(409).json({ error: "This calendar is already in the list." });
      if (!response.ok) throw new Error("Save failed");
      attempts.delete(ip);
      return res.status(201).json({ saved: true });
    } catch {
      return res.status(503).json({ error: "Unable to save the calendar right now. Please try again later." });
    }
  };
}
