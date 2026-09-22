import ical from "node-ical";

export function calendarSource(input) {
  if (typeof input !== "string" || input.length > 2048)
    throw new Error("Enter a Google Calendar link.");
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "calendar.google.com" ||
    url.port ||
    url.username ||
    url.password
  ) {
    throw new Error("Only HTTPS links on calendar.google.com are supported.");
  }
  const feed = url.pathname.match(
    /^\/calendar\/ical\/([^/]+)\/(public|private-[a-f0-9]+)\/basic\.ics$/,
  );
  let id = feed ? decodeURIComponent(feed[1]) : url.searchParams.get("src");
  if (!id && url.searchParams.has("cid")) {
    const cid = url.searchParams.get("cid");
    id = cid.includes("@")
      ? cid
      : Buffer.from(cid, "base64url").toString("utf8");
  }
  if (!id || !/^[a-zA-Z0-9_.+@-]+$/.test(id) || !id.includes("@"))
    throw new Error("This link does not contain a valid calendar ID.");
  return {
    id,
    url: `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/${feed?.[2] || "public"}/basic.ics`,
  };
}

const value = (input) =>
  typeof input === "object" && input !== null
    ? String(input.val ?? "")
    : String(input ?? "");
// node-ical's expanded all-day instances use local calendar midnight, without tz metadata.
const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const person = (p) => ({
  email: value(p).replace(/^mailto:/i, ""),
  displayName: p?.params?.CN || "",
  responseStatus:
    {
      "NEEDS-ACTION": "needsAction",
      ACCEPTED: "accepted",
      DECLINED: "declined",
      TENTATIVE: "tentative",
    }[p?.params?.PARTSTAT] || "needsAction",
});

export async function parseCalendar(text, id, from, to) {
  const data = await ical.async.parseICS(text);
  const name = value(data.vcalendar?.["WR-CALNAME"]) || id;
  const events = [];
  for (const event of Object.values(data)) {
    if (event.type !== "VEVENT" || !event.start || event.status === "CANCELLED")
      continue;
    const allDay = event.datetype === "date" || event.start.dateOnly;
    const expansionFrom = allDay ? new Date(+from - 2 * 86400000) : from;
    const expansionTo = allDay ? new Date(+to + 2 * 86400000) : to;
    for (const instance of ical.expandRecurringEvent(event, {
      from: expansionFrom,
      to: expansionTo,
      expandOngoing: true,
    })) {
      const e = instance.event;
      const start = instance.isFullDay
        ? new Date(dateKey(instance.start) + "T00:00:00+08:00")
        : instance.start;
      const end = instance.isFullDay
        ? new Date(dateKey(instance.end) + "T00:00:00+08:00")
        : instance.end;
      if (e.status === "CANCELLED" || start >= to || end <= from) continue;
      const stamp = (d) =>
        instance.isFullDay
          ? { date: dateKey(d) }
          : { dateTime: d.toISOString() };
      events.push({
        id: value(e.uid),
        iCalUID: value(e.uid),
        summary: value(instance.summary) || "(No title)",
        description: value(e.description),
        location: value(e.location),
        start: stamp(instance.start),
        end: stamp(instance.end),
        status: "confirmed",
        organizer: e.organizer ? person(e.organizer) : undefined,
        attendees: (Array.isArray(e.attendee)
          ? e.attendee
          : e.attendee
            ? [e.attendee]
            : []
        ).map(person),
        calendarId: id,
        calendarName: name,
      });
      if (events.length > 20000)
        throw new Error("Too many events in this period.");
    }
  }
  return { calendar: { id, summary: name, linked: true }, events };
}

export async function fetchCalendar(input, from, to) {
  const source = calendarSource(input);
  const response = await fetch(source.url, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    if ([401, 403, 404].includes(response.status))
      throw new Error(
        "Calendar is unavailable or not public. Use Google sign-in with an authorized account, or its secret iCal link.",
      );
    throw new Error(
      `Google Calendar returned ${response.status}. Try again later.`,
    );
  }
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 8 * 1024 * 1024)
      throw new Error("Calendar feed exceeds the 8 MB limit.");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trimStart().startsWith("BEGIN:VCALENDAR"))
    throw new Error("Google did not return a calendar feed.");
  return parseCalendar(text, source.id, from, to);
}
