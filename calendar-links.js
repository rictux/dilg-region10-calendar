import { calendarSource } from "./calendar.js";

export async function fetchCalendarLinks({
  url = process.env.supabase_url || process.env.SUPABASE_URL,
  key = process.env.supabase_publishable_key || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
  fetchImpl = fetch,
} = {}) {
  if (!url || !key) {
    throw new Error("Calendar storage is not configured on the server.");
  }
  const base = new URL(url);
  if (
    (base.protocol !== "https:" &&
      !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) ||
    base.username || base.password || base.search || base.hash || base.pathname !== "/"
  ) {
    throw new Error("supabase_url must be the HTTPS API origin (HTTP is allowed only on localhost).");
  }
  const endpoint = new URL("/rest/v1/calendar_links", base);
  endpoint.search = new URLSearchParams({
    select: "id,name,link",
    order: "name.asc,id.asc",
    limit: "16",
  });
  const headers = {
    apikey: key,
    "Accept-Profile": "system_calendar",
    Accept: "application/json",
  };
  // Legacy self-hosted anon keys are JWTs. Publishable keys are not bearer JWTs.
  if (!key.startsWith("sb_publishable_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetchImpl(endpoint, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`Supabase calendar lookup failed (HTTP ${response.status}). Check the API key, exposed schema, and read permissions.`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length > 15) {
    throw new Error("Calendar storage must return an array of at most 15 calendars.");
  }
  const seen = new Set();
  return rows.map((row) => {
    if (
      !row || typeof row.id !== "string" ||
      typeof row.name !== "string" || !row.name.trim() || row.name.length > 200
    ) {
      throw new Error("Calendar storage returned an invalid calendar record.");
    }
    const source = calendarSource(row.link);
    if (!source.url.endsWith("/public/basic.ics")) {
      throw new Error("Calendar storage must contain only public calendar links.");
    }
    if (seen.has(source.id)) {
      throw new Error("Calendar storage contains duplicate Google calendar IDs.");
    }
    seen.add(source.id);
    return { id: row.id, name: row.name.trim(), link: row.link };
  });
}
