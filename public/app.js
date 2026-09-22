// Calendar arithmetic uses UTC fields shifted to Manila, independent of the viewer's timezone.
function manilaNow() {
  return new Date(Date.now() + 8 * 3600000);
}

const DEFAULT_LINKS = [
  "https://calendar.google.com/calendar/embed?src=dilg.lgmed10%40gmail.com&ctz=Asia%2FManila",
  "https://calendar.google.com/calendar/u/0?cid=NDAyOTBiNjJjOTkyNWYzYjhlMGNlMTMzOTEyMDY1NjRiZWVhMWU0MTc2MDRlYjVkODNlNmIzNWRiYWI5OTFmM0Bncm91cC5jYWxlbmRhci5nb29nbGUuY29t",
  "https://calendar.google.com/calendar/embed?src=rtenplanning%40gmail.com&ctz=Asia%2FManila",
  "https://calendar.google.com/calendar/embed?src=qmsec10dilg%40gmail.com&ctz=Asia%2FManila",
  "https://calendar.google.com/calendar/embed?src=region10personnel%40gmail.com&ctz=Asia%2FManila",
  "https://calendar.google.com/calendar/u/0?cid=ZGlsZzEwcGRtdUBnbWFpbC5jb20",
  "https://calendar.google.com/calendar/embed?src=lgcdd10dilg%40gmail.com&ctz=Asia%2FManila",
];
const DEFAULT_NAMES = [
  "LGMED",
  "Shared regional calendar",
  "Planning",
  "Quality Management",
  "Personnel",
  "PDMU",
  "LGCDD",
];
function safeRead(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    toast(
      "Browser storage is unavailable; changes will last for this session.",
    );
  }
}
let activeLinks = DEFAULT_LINKS;
try {
  const saved = JSON.parse(safeRead("calendar_digest_links"));
  if (
    Array.isArray(saved) &&
    saved.length &&
    saved.length <= 15 &&
    saved.every((x) => typeof x === "string")
  ) {
    activeLinks = [...saved];
    // Add the newly configured calendar once without replacing custom links.
    // The marker lets users remove it later without it reappearing on reload.
    for (const [key, calendarId, calendarLink] of [
      ["calendar_digest_pdmu_added", "dilg10pdmu@gmail.com", DEFAULT_LINKS[5]],
      ["calendar_digest_lgcdd_added", "lgcdd10dilg@gmail.com", DEFAULT_LINKS[6]],
    ]) {
      if (safeRead(key)) continue;
      const included = activeLinks.some((link) => {
        try {
          const params = new URL(link).searchParams;
          const cid = params.get("cid") || "";
          const id = params.get("src") || (cid.includes("@") ? cid : atob(cid));
          return id.toLowerCase() === calendarId || decodeURIComponent(link).toLowerCase().includes(`/${calendarId}/`);
        } catch { return false; }
      });
      const canAdd = !included && activeLinks.length < 15;
      if (canAdd) activeLinks.push(calendarLink);
      if (included || canAdd) {
        localStorage.setItem("calendar_digest_links", JSON.stringify(activeLinks));
        localStorage.setItem(key, "1");
      }
    }
  } else {
    localStorage.setItem("calendar_digest_pdmu_added", "1");
    localStorage.setItem("calendar_digest_lgcdd_added", "1");
  }
} catch {}
let sourceResults = [],
  loading = false,
  requestVersion = 0,
  loadedMonth = "";
const COLORS = [
  "#e96b3e",
  "#4c78a8",
  "#d7a640",
  "#6f967f",
  "#9b6da9",
  "#bd6b77",
  "#527b70",
];
const state = {
  view: "day",
  cursor: manilaNow(),
  calendars: [],
  events: [],
  selected: new Set(),
  token: null,
  connected: false,
  demo: false,
  source: "links",
  modeFilter: "all",
  scopeFilter: "all",
  groupFilter: "all",
};
const $ = (id) => document.getElementById(id);
const fmtDate = (d, opt = {}) =>
  new Intl.DateTimeFormat("en-PH", { ...opt, timeZone: "UTC" }).format(d);
const startOfDay = (d) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
};
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
const eventDate = (e) =>
  e.start.dateTime
    ? new Date(Date.parse(e.start.dateTime) + 8 * 3600000)
    : new Date(e.start.date + "T00:00:00Z");
const eventEnd = (e) =>
  e.end.dateTime
    ? new Date(Date.parse(e.end.dateTime) + 8 * 3600000)
    : new Date(e.end.date + "T00:00:00Z");
const isAllDay = (e) => !e.start.dateTime;
const duration = (e) =>
  isAllDay(e) ? 0 : Math.max(0, (eventEnd(e) - eventDate(e)) / 36e5);
const category = (e) => {
  const s = (e.summary + " " + (e.description || "")).toLowerCase();
  if (/training|workshop|seminar|orientation|learning/.test(s))
    return "Training";
  if (/meeting|conference|call|huddle|committee|review/.test(s))
    return "Meetings";
  if (/field|travel|visit|inspection|onsite|on-site/.test(s))
    return "Field work";
  if (/report|admin|planning|documentation|deadline|submit/.test(s))
    return "Admin";
  return "Other";
};
const plainText = (html) => {
  const d = new DOMParser().parseFromString(html || "", "text/html");
  return (d.body.textContent || "").replace(/\s+/g, " ").trim();
};
function stakeholderCategories(e) {
  const attendeeText = (e.attendees || [])
      .map((a) => (a.displayName || "") + " " + (a.email || ""))
      .join(" "),
    s = (
      " " +
      [
        e.summary,
        e.description,
        e.location,
        attendeeText,
        e.organizer?.displayName,
        e.organizer?.email,
      ]
        .filter(Boolean)
        .join(" ") +
      " "
    ).toLowerCase(),
    out = [];
  if (
    /\b(dilg|department of the interior and local government|regional office|rictu|lgmed|lgcdd|fad|pdm[uU])\b/i.test(
      s,
    )
  )
    out.push("DILG / RO");
  if (
    /\b(nga|national government|dswd|doh|deped|denr|dpwh|dost|dti|dole|tesda|neda|dbm|coa|csc|dict|dhsud|pnp|bfp|bjmp)\b/i.test(
      s,
    )
  )
    out.push("NGA");
  if (
    /\b(lgu|local government|barangay|municipal|municipality|city government|provincial government|mayor|governor|sangguniang|liga ng)\b/i.test(
      s,
    )
  )
    out.push("LGU");
  if (
    /\b(cso|civil society|ngo|non-government|people'?s organization|cooperative|academe|chamber|private sector)\b/i.test(
      s,
    )
  )
    out.push("CSO / Partner");
  if (
    /\b(field officer|field personnel|field operating unit|fou|provincial office|provincial director|city director|mlgoo|clgoo|lgoo|field focal)\b/i.test(
      s,
    )
  )
    out.push("Field Officers");
  if (/\b(guest|speaker|resource person|visitor|delegate)\b/i.test(s))
    out.push("External Guests");
  return out.length ? [...new Set(out)] : ["Other / Unspecified"];
}
function peopleInvolved(e) {
  const rows = [],
    seen = new Set(),
    add = (name, role, status) => {
      const label = (name || "").trim();
      if (!label || seen.has(label.toLowerCase())) return;
      seen.add(label.toLowerCase());
      rows.push({ name: label, role, status });
    };
  add(e.organizer?.displayName || e.organizer?.email, "Organizer", "");
  (e.attendees || [])
    .filter((a) => !a.resource)
    .forEach((a) =>
      add(
        a.displayName || a.email,
        a.organizer
          ? "Organizer"
          : a.optional
            ? "Optional attendee"
            : "Attendee",
        a.responseStatus || "",
      ),
    );
  return rows;
}
function expectedGuests(e) {
  const text = plainText(e.description || ""),
    pattern =
      /(?:^|[.!?]\s+)(expected guests?|guests?|participants?|attendees?|resource persons?|speakers?|officials involved|people involved)\s*[:\-]\s*([^.!?]+)/gi,
    found = [];
  let match;
  while ((match = pattern.exec(text))) found.push(match[2].trim());
  return found.slice(0, 4);
}
function descriptionBrief(e) {
  const text = plainText(e.description || "");
  if (!text) return "No activity description was provided.";
  const sentence =
    text.match(/^.{1,220}?(?:[.!?](?:\s|$)|$)/)?.[0] || text.slice(0, 220);
  return sentence.length < text.length
    ? sentence.trim() + "…"
    : sentence.trim();
}
function venueOf(e) {
  const direct = plainText(e.location || "");
  if (direct) return direct;
  const text = plainText(e.description || ""),
    match = text.match(
      /(?:^|[.!?]\s+)(?:venue|location|place|platform)\s*[:\-]\s*([^.!?]+)/i,
    );
  if (match) return match[1].trim();
  const url =
    e.hangoutLink ||
    e.conferenceData?.entryPoints?.find((x) => x.entryPointType === "video")
      ?.uri;
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "Online";
    }
  }
  return "Not specified";
}
function deliveryMode(e) {
  const text = (
      " " +
      [
        e.summary,
        e.description,
        e.location,
        e.hangoutLink,
        JSON.stringify(e.conferenceData || {}),
      ]
        .filter(Boolean)
        .join(" ") +
      " "
    ).toLowerCase(),
    online =
      /\b(online|virtual|zoom|google meet|meet\.google|microsoft teams|teams\.microsoft|webex|webinar|teleconference|video call)\b/i.test(
        text,
      ),
    onsite =
      /\b(face[- ]to[- ]face|in[- ]person|on[- ]site|onsite|hotel|function room|conference (?:room|hall|center)|training (?:room|center)|regional office|provincial office|city hall|municipal hall|barangay hall)\b/i.test(
        text,
      );
  return online && onsite
    ? "Hybrid"
    : online
      ? "Online"
      : onsite || venueOf(e) !== "Not specified"
        ? "Face-to-face"
        : "Unspecified";
}
function eventLevel(e) {
  const text = (
    " " +
    [e.summary, e.description, e.location, e.calendarName]
      .filter(Boolean)
      .join(" ") +
    " "
  ).toLowerCase();
  if (
    /\b(field office|field personnel|provincial office|provincial director|huc|city office|city director|municipal|mlgoo|clgoo|lgoo|barangay|fou)\b/i.test(
      text,
    )
  )
    return "Field Office";
  if (
    /\b(regional|region x|region 10|regional office|regional director|ord|oard|lgmed|lgcdd|rictu)\b/i.test(
      text,
    )
  )
    return "Regional";
  return "Unspecified";
}
function findConflicts(ev) {
  const timed = ev.filter((e) => !isAllDay(e)),
    pairs = [];
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i],
        b = timed[j];
      if (eventDate(a) < eventEnd(b) && eventDate(b) < eventEnd(a)) {
        const start = new Date(Math.max(eventDate(a), eventDate(b))),
          end = new Date(Math.min(eventEnd(a), eventEnd(b)));
        pairs.push({ a, b, start, end });
      }
    }
  return pairs;
}
function range() {
  if (state.view === "day")
    return [startOfDay(state.cursor), endOfDay(state.cursor)];
  const a = new Date(
      Date.UTC(state.cursor.getUTCFullYear(), state.cursor.getUTCMonth(), 1),
    ),
    b = new Date(
      Date.UTC(
        state.cursor.getUTCFullYear(),
        state.cursor.getUTCMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    );
  return [a, b];
}
function currentEvents({ ignoreGroup = false } = {}) {
  const [a, b] = range();
  return state.events
    .filter(
      (e) =>
        state.selected.has(e.calendarId) &&
        eventDate(e) <= b &&
        eventEnd(e) > a &&
        e.status !== "cancelled" &&
        (state.modeFilter === "all" || deliveryMode(e) === state.modeFilter) &&
        (state.scopeFilter === "all" || eventLevel(e) === state.scopeFilter) &&
        (ignoreGroup || state.groupFilter === "all" || stakeholderCategories(e).includes(state.groupFilter)),
    )
    .sort((x, y) => eventDate(x) - eventDate(y));
}
function render() {
  const ev = currentEvents(),
    [a] = range(),
    unique = new Set(ev.map((e) => e.calendarId)).size,
    hours = ev.reduce((n, e) => n + duration(e), 0),
    conflicts = findConflicts(ev);
  $("pageTitle").textContent =
    state.view === "day" ? "Today’s activity" : "Monthly activity";
  $("subtitle").textContent =
    state.view === "day"
      ? "A clear view of where your day is going."
      : "Patterns and scheduled workload at a glance.";
  $("periodTitle").textContent =
    state.view === "day"
      ? fmtDate(a, {
          weekday: "short",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : fmtDate(a, { month: "long", year: "numeric" });
  $("metricEvents").textContent = ev.length;
  $("metricHours").textContent = formatHours(hours);
  $("metricCalendars").textContent = unique;
  $("metricConflicts").textContent = conflicts.length;
  $("metricEventsNote").textContent =
    ev.length === 1 ? "scheduled activity" : "scheduled activities";
  if (state.view === "day") {
    const open = Math.max(0, 8 - hours);
    $("metricFourthLabel").textContent = "Remaining capacity";
    $("metricFourth").textContent = formatHours(open);
    $("metricFourthNote").textContent = "8h less scheduled hours; estimate";
  } else {
    const counts = byDay(ev),
      best = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
    $("metricFourthLabel").textContent = "Busiest day";
    $("metricFourth").textContent = best
      ? fmtDate(new Date(best[0] + "T00:00:00Z"), {
          month: "short",
          day: "numeric",
        })
      : "—";
    $("metricFourthNote").textContent = best
      ? best[1] + " activities"
      : "no activities this month";
  }
  renderSummary(ev, hours, conflicts);
  renderBreakdown(ev);
  renderAnalytics(ev);
  renderStakeholders(currentEvents({ ignoreGroup: true }));
  renderConflicts(conflicts);
  renderSuggestions(ev, conflicts);
  renderAgenda(ev);
  renderAvailability();
}
function formatHours(n) {
  if (!n) return "0h";
  const h = Math.floor(n),
    m = Math.round((n - h) * 60);
  return h + (m ? "h " + m + "m" : "h");
}
function byDay(ev) {
  return ev.reduce((o, e) => {
    const k = localKey(eventDate(e));
    o[k] = (o[k] || 0) + 1;
    return o;
  }, {});
}
function localKey(d) {
  return (
    d.getUTCFullYear() +
    "-" +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getUTCDate()).padStart(2, "0")
  );
}
function renderSummary(ev, hours, conflicts) {
  const cats = ev.reduce(
      (o, e) => ((o[category(e)] = (o[category(e)] || 0) + 1), o),
      {},
    ),
    top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0],
    allDay = ev.filter(isAllDay).length;
  if (!ev.length) {
    $("summaryLead").textContent =
      "No activities are scheduled for this period.";
    $("insights").innerHTML =
      '<div class="insight"><span class="bullet"></span><span>This period is open. Adjust the calendar filter if you expected to see an activity.</span></div>';
    return;
  }
  $("summaryLead").textContent =
    state.view === "day"
      ? `You have ${ev.length} ${ev.length === 1 ? "activity" : "activities"} scheduled, accounting for ${formatHours(hours)} of timed work.`
      : `This month contains ${ev.length} scheduled ${ev.length === 1 ? "activity" : "activities"} across ${new Set(ev.map((e) => e.calendarId)).size} calendars.`;
  const bits = [];
  if (conflicts.length)
    bits.push(
      `<b>${conflicts.length} possible ${conflicts.length === 1 ? "conflict" : "conflicts"}</b> detected from overlapping timed activities.`,
    );
  if (top)
    bits.push(
      `<b>${esc(top[0])}</b> is the largest activity category with ${top[1]} ${top[1] === 1 ? "entry" : "entries"}.`,
    );
  const stakeholders = ev
      .flatMap(stakeholderCategories)
      .reduce((o, k) => ((o[k] = (o[k] || 0) + 1), o), {}),
    topStake = Object.entries(stakeholders)
      .filter((x) => x[0] !== "Other / Unspecified")
      .sort((a, b) => b[1] - a[1])[0];
  if (topStake)
    bits.push(
      `<b>${esc(topStake[0])}</b> is the most frequently involved stakeholder group, appearing in ${topStake[1]} activities.`,
    );
  const longest = ev
    .filter((e) => !isAllDay(e))
    .sort((a, b) => duration(b) - duration(a))[0];
  if (longest)
    bits.push(
      `The longest scheduled activity is <b>${esc(longest.summary)}</b> at ${formatHours(duration(longest))}.`,
    );
  if (state.view === "month") {
    const best = Object.entries(byDay(ev)).sort((a, b) => b[1] - a[1])[0];
    if (best)
      bits.push(
        `<b>${fmtDate(new Date(best[0] + "T00:00:00Z"), { weekday: "long", month: "long", day: "numeric" })}</b> is the busiest day with ${best[1]} activities.`,
      );
  } else if (hours > 8)
    bits.push(
      `The day is scheduled <b>${formatHours(hours - 8)} beyond</b> an 8-hour workday.`,
    );
  else
    bits.push(
      `<b>${formatHours(Math.max(0, 8 - hours))}</b> of an 8-hour workday remains after subtracting scheduled hours; overlapping activities are counted separately.`,
    );
  if (allDay)
    bits.push(
      `${allDay} all-day ${allDay === 1 ? "activity is" : "activities are"} included but excluded from scheduled-hour totals.`,
    );
  $("insights").innerHTML = bits
    .slice(0, 3)
    .map(
      (x) =>
        `<div class="insight"><span class="bullet"></span><span>${x}</span></div>`,
    )
    .join("");
  $("summaryMode").textContent =
    state.view === "day" ? "Daily digest" : "Monthly digest";
}
function renderBreakdown(ev) {
  const counts = ev.reduce(
      (o, e) => ((o[category(e)] = (o[category(e)] || 0) + 1), o),
      {},
    ),
    items = Object.entries(counts).sort((a, b) => b[1] - a[1]),
    max = Math.max(1, ...items.map((x) => x[1]));
  $("breakdown").innerHTML = items.length
    ? items
        .slice(0, 5)
        .map(
          ([k, v]) =>
            `<div class="bar-row"><span>${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / max) * 100}%"></div></div><span class="bar-value">${v}</span></div>`,
        )
        .join("")
    : '<div class="empty"><strong>No activity mix yet</strong>Nothing to categorize.</div>';
}
function analyticRows(items, total) {
  return items
    .map(
      ([label, count]) =>
        `<div class="stat-row"><span>${esc(label)}</span><div class="stat-bar"><span style="width:${total ? (count / total) * 100 : 0}%"></span></div><b>${count}</b></div>`,
    )
    .join("");
}
function renderAnalytics(ev) {
  const modes = ["Online", "Face-to-face", "Hybrid", "Unspecified"].map((k) => [
      k,
      ev.filter((e) => deliveryMode(e) === k).length,
    ]),
    levels = ["Regional", "Field Office", "Unspecified"].map((k) => [
      k,
      ev.filter((e) => eventLevel(e) === k).length,
    ]),
    venues = Object.entries(
      ev.reduce((o, e) => {
        const v = venueOf(e);
        o[v] = (o[v] || 0) + 1;
        return o;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  $("analytics").innerHTML =
    `<section class="analytics-block"><h3>Delivery format</h3>${analyticRows(modes, ev.length)}</section><section class="analytics-block"><h3>Event level</h3>${analyticRows(levels, ev.length)}</section><section class="analytics-block"><h3>Most-used venues</h3>${venues.length ? venues.map(([v, n]) => `<div class="venue-row"><b title="${esc(v)}">${esc(v)}</b><span>${n} ${n === 1 ? "activity" : "activities"}</span></div>`).join("") : '<div class="empty"><strong>No venue data</strong></div>'}</section>`;
}
function renderStakeholders(ev) {
  const order = [
      "DILG / RO",
      "NGA",
      "LGU",
      "CSO / Partner",
      "Field Officers",
      "External Guests",
      "Other / Unspecified",
    ],
    counts = ev
      .flatMap(stakeholderCategories)
      .reduce((o, k) => ((o[k] = (o[k] || 0) + 1), o), {});
  $("stakeholders").innerHTML =
    `<button type="button" class="stake-box" data-group="all" aria-pressed="${state.groupFilter === "all"}"><strong>${ev.length}</strong><span>All groups</span></button>` +
    order
      .filter((k) => counts[k] || state.groupFilter === k)
      .map(
        (k) =>
          `<button type="button" class="stake-box" data-group="${esc(k)}" aria-pressed="${state.groupFilter === k}"><strong>${counts[k] || 0}</strong><span>${esc(k)}</span></button>`,
      )
      .join("");
  $("groupFilterStatus").textContent = state.groupFilter === "all"
    ? "Select a group to filter activities. Activities may belong to several groups."
    : `Filtering by ${state.groupFilter}. Select it again or All groups to clear.`;
}
$("stakeholders").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-group]");
  if (!button) return;
  const group = button.dataset.group;
  state.groupFilter = state.groupFilter === group ? "all" : group;
  render();
  // Rendering replaces the cards; keep focus on the activated control.
  [...$("stakeholders").querySelectorAll("[data-group]")]
    .find((item) => item.dataset.group === group)?.focus();
});
function renderConflicts(pairs) {
  $("conflictCount").textContent = pairs.length
    ? `${pairs.length} detected`
    : "No overlaps";
  $("conflicts").innerHTML = pairs.length
    ? pairs
        .map(
          (x) =>
            `<div class="conflict-item"><span class="conflict-time">${fmtDate(x.start, { month: "short", day: "numeric" })}<br>${fmtDate(x.start, { hour: "numeric", minute: "2-digit" })}–${fmtDate(x.end, { hour: "numeric", minute: "2-digit" })}</span><div class="conflict-pair"><strong>${esc(x.a.summary)} ↔ ${esc(x.b.summary)}</strong>${esc(x.a.calendarName)} and ${esc(x.b.calendarName)}</div><span class="conflict-badge">Overlapping</span></div>`,
        )
        .join("")
    : '<div class="empty"><strong>No schedule conflicts detected</strong>Timed activities do not overlap in this period.</div>';
}
function renderSuggestions(ev, conflicts) {
  const items = [],
    missingVenue = ev.filter(
      (e) =>
        ["Face-to-face", "Hybrid"].includes(deliveryMode(e)) &&
        venueOf(e) === "Not specified",
    ).length,
    missingMode = ev.filter((e) => deliveryMode(e) === "Unspecified").length,
    missingDescription = ev.filter(
      (e) => !plainText(e.description || ""),
    ).length,
    pending = ev.reduce(
      (n, e) =>
        n +
        (e.attendees || []).filter((a) => a.responseStatus === "needsAction")
          .length,
      0,
    ),
    timed = ev
      .filter((e) => !isAllDay(e))
      .sort((a, b) => eventDate(a) - eventDate(b));
  let tightTransitions = 0;
  for (let i = 1; i < timed.length; i++) {
    const a = timed[i - 1],
      b = timed[i],
      gap = (eventDate(b) - eventEnd(a)) / 6e4,
      sameDay = localKey(eventDate(a)) === localKey(eventDate(b)),
      physical = [deliveryMode(a), deliveryMode(b)].some(
        (x) => x === "Face-to-face" || x === "Hybrid",
      ),
      differentVenue = venueOf(a) !== venueOf(b);
    if (sameDay && gap >= 0 && gap <= 60 && physical && differentVenue)
      tightTransitions++;
  }
  if (conflicts.length)
    items.push([
      "Resolve overlaps",
      `${conflicts.length} overlapping ${conflicts.length === 1 ? "schedule needs" : "schedules need"} review.`,
    ]);
  if (tightTransitions)
    items.push([
      "Allow travel or setup time",
      `${tightTransitions} back-to-back ${tightTransitions === 1 ? "transition has" : "transitions have"} 60 minutes or less between different venues or formats.`,
    ]);
  if (missingVenue)
    items.push([
      "Complete venue details",
      `${missingVenue} face-to-face or hybrid ${missingVenue === 1 ? "activity has" : "activities have"} no identifiable venue.`,
    ]);
  if (missingMode)
    items.push([
      "Confirm delivery format",
      `${missingMode} ${missingMode === 1 ? "activity is" : "activities are"} not clearly online or face-to-face.`,
    ]);
  if (pending)
    items.push([
      "Follow up attendance",
      `${pending} invited ${pending === 1 ? "person has" : "people have"} not responded.`,
    ]);
  if (missingDescription)
    items.push([
      "Improve activity details",
      `${missingDescription} ${missingDescription === 1 ? "activity needs" : "activities need"} a description for better summaries.`,
    ]);
  if (!items.length)
    items.push([
      "Schedule looks ready",
      "No conflicts or important missing details were detected.",
    ]);
  $("suggestions").innerHTML = items
    .slice(0, 4)
    .map(
      ([title, body], i) =>
        `<div class="suggestion"><span class="suggestion-icon">${i + 1}</span><div><strong>${esc(title)}</strong>${esc(body)}</div></div>`,
    )
    .join("");
}
function renderAgenda(ev) {
  $("agendaTitle").textContent =
    state.view === "day" ? "Daily activities" : "All monthly activities";
  $("agendaCount").textContent =
    ev.length + " " + (ev.length === 1 ? "activity" : "activities");
  if (!ev.length) {
    $("agenda").innerHTML =
      '<div class="empty"><strong>Your schedule is clear</strong>No activities found for the selected period and calendars.</div>';
    return;
  }
  const groups = ev.reduce((o, e) => {
    const k = localKey(eventDate(e));
    (o[k] ??= []).push(e);
    return o;
  }, {});
  $("agenda").innerHTML = Object.entries(groups)
    .map(([k, items]) => {
      const d = new Date(k + "T00:00:00Z");
      return `<div class="day-group"><div class="day-title"><strong>${fmtDate(d, { weekday: "long", month: "long", day: "numeric" })}</strong><span>${items.length} ${items.length === 1 ? "activity" : "activities"}</span></div>${items.map(eventRow).join("")}</div>`;
    })
    .join("");
}
function eventRow(e) {
  const cal = state.calendars.find((c) => c.id === e.calendarId),
    time = isAllDay(e)
      ? "All day"
      : fmtDate(eventDate(e), { hour: "numeric", minute: "2-digit" }) +
        "–" +
        fmtDate(eventEnd(e), { hour: "numeric", minute: "2-digit" }),
    people = peopleInvolved(e),
    guests = expectedGuests(e),
    groups = stakeholderCategories(e),
    accepted = people.filter((p) => p.status === "accepted").length,
    pending = people.filter((p) => p.status === "needsAction").length,
    mode = deliveryMode(e),
    level = eventLevel(e),
    venue = venueOf(e),
    modeClass =
      mode === "Online"
        ? "online"
        : mode === "Face-to-face"
          ? "onsite"
          : mode === "Hybrid"
            ? "hybrid"
            : "";
  const peopleText = people.length
    ? people
        .slice(0, 8)
        .map((p) => `${esc(p.name)}${p.role ? " (" + esc(p.role) + ")" : ""}`)
        .join(", ")
    : "No attendee list is available.";
  return `<details class="event-wrap"><summary class="event"><span class="event-color" style="background:${esc(e.color || cal?.backgroundColor || "#1b3b2f")}"></span><span class="event-time">${time}</span><div><div class="event-title">${esc(e.summary || "(No title)")}</div><div class="event-meta">${esc(e.calendarName)} · ${esc(venue)}${people.length ? " · " + people.length + " people" : ""}</div></div><span class="event-badges"><span class="pill ${modeClass}">${esc(mode)}</span><span class="pill">${esc(level)}</span></span></summary><div class="event-extra"><p><strong>Activity summary:</strong> ${esc(descriptionBrief(e))}</p><p><strong>Venue/platform:</strong> ${esc(venue)} · <strong>Format:</strong> ${esc(mode)} · <strong>Event level:</strong> ${esc(level)}</p><p><strong>People involved:</strong> ${peopleText}${accepted || pending ? ` · ${accepted} accepted${pending ? ", " + pending + " awaiting response" : ""}` : ""}</p>${guests.length ? `<p><strong>Expected guests:</strong> ${guests.map(esc).join("; ")}</p>` : ""}<div class="event-tags"><span class="tag">${esc(category(e))}</span>${groups.map((g) => `<span class="tag">${esc(g)}</span>`).join("")}</div></div></details>`;
}
function renderCalendarMenu() {
  $("calendarList").innerHTML = state.calendars
    .map(
      (c) =>
        `<label class="cal-item"><input type="checkbox" data-cal="${esc(c.id)}" ${state.selected.has(c.id) ? "checked" : ""}><span class="cal-dot" style="background:${esc(c.backgroundColor || "#5b7f70")}"></span><span>${esc(c.summary)}${c.primary ? " (Primary)" : ""}</span></label>`,
    )
    .join("");
  $("calFilter").textContent =
    state.selected.size === state.calendars.length
      ? "All calendars ▾"
      : state.selected.size + " selected ▾";
  document.querySelectorAll("[data-cal]").forEach(
    (el) =>
      (el.onchange = () => {
        el.checked
          ? state.selected.add(el.dataset.cal)
          : state.selected.delete(el.dataset.cal);
        renderCalendarMenu();
        // Keep keyboard focus on the checkbox after rebuilding its label.
        [...document.querySelectorAll("[data-cal]")]
          .find((input) => input.dataset.cal === el.dataset.cal)?.focus();
        render();
      }),
  );
}
function openLinksDialog() {
  $("calendarLinks").value = activeLinks.join("\n");
  $("linksError").style.display = "none";
  $("linksDialog").showModal();
}
function setLinkLoading(on) {
  $("linkBtn").disabled = on;
  $("importLinksBtn").disabled = on;
  $("linkBtn").innerHTML = on
    ? '<span class="loading"></span> Importing…'
    : "Add calendar links";
  $("importLinksBtn").innerHTML = on
    ? '<span class="loading"></span> Importing…'
    : "Import calendars";
}
async function beginConnect() {
  const stored = safeRead("calendar_digest_client_id");
  if (!stored) {
    $("clientId").value = "";
    $("setupError").style.display = "none";
    $("setupDialog").showModal();
    return;
  }
  await authorize(stored);
}
async function authorize(clientId) {
  if (!window.google?.accounts?.oauth2) {
    toast("Google sign-in is still loading. Please try again.");
    return;
  }
  setLoading(true);
  try {
    const token = await new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/calendar.readonly",
        callback: (r) =>
          r.error ? reject(new Error(r.error)) : resolve(r.access_token),
        error_callback: (e) =>
          reject(new Error(e.type || "Authorization cancelled")),
      });
      client.requestAccessToken({ prompt: "" });
    });
    state.token = token;
    await loadGoogleData();
    state.connected = true;
    state.demo = false;
    state.source = "oauth";
    sourceResults = [];
    render();
    if ($("connectBtn")) $("connectBtn").textContent = "Refresh Google";
    $("sideStatus").textContent = "Google Calendar connected";
    $("sideDot").classList.add("live");
    toast("Calendars updated successfully.");
  } catch (e) {
    const message = e.message || "Could not connect to Google Calendar.";
    toast(message);
    if (/client|origin|initialization/i.test(message)) {
      $("clientId").value = clientId;
      $("setupError").textContent =
        "Check the Client ID and make sure this site URL is an authorized JavaScript origin.";
      $("setupError").style.display = "block";
      $("setupDialog").showModal();
    }
  } finally {
    setLoading(false);
  }
}
async function api(path) {
  const r = await fetch("https://www.googleapis.com/calendar/v3" + path, {
    headers: { Authorization: "Bearer " + state.token },
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error?.message || "Google Calendar request failed.");
  }
  return r.json();
}
async function paged(path) {
  let items = [],
    token = "";
  do {
    const join = path.includes("?") ? "&" : "?";
    const data = await api(
      path + (token ? join + "pageToken=" + encodeURIComponent(token) : ""),
    );
    items.push(...(data.items || []));
    token = data.nextPageToken || "";
  } while (token);
  return items;
}
async function loadGoogleData() {
  const rows = await paged(
    "/users/me/calendarList?minAccessRole=reader&showHidden=false",
  );
  const calendars = rows.map((c, i) => ({
    ...c,
    backgroundColor: c.backgroundColor || COLORS[i % COLORS.length],
  }));
  const { from, to } = requestRange();
  const batches = await Promise.all(
    calendars.map(async (c) => {
      const path =
        "/calendars/" +
        encodeURIComponent(c.id) +
        "/events?singleEvents=true&orderBy=startTime&showDeleted=false&timeMin=" +
        encodeURIComponent(from) +
        "&timeMax=" +
        encodeURIComponent(to);
      const rows = await paged(path);
      return rows.map((e) => ({
        ...e,
        calendarId: c.id,
        calendarName: c.summary,
        color: e.colorId ? c.backgroundColor : c.backgroundColor,
      }));
    }),
  );
  const previous = new Set(state.selected),
    previousIds = new Set(state.calendars.map((c) => c.id));
  state.calendars = calendars;
  state.selected = new Set(
    calendars
      .filter((c) => !previousIds.has(c.id) || previous.has(c.id))
      .map((c) => c.id),
  );
  loadedMonth = monthKey();
  const seen = new Set();
  state.events = batches.flat().filter((e) => {
    const key =
      e.calendarId +
      "|" +
      (e.iCalUID || e.id) +
      "|" +
      (e.start.dateTime || e.start.date);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  renderCalendarMenu();
  render();
}
function setLoading(on) {
  if (!$("connectBtn")) return;
  $("connectBtn").disabled = on;
  $("connectBtn").innerHTML = on
    ? '<span class="loading"></span> Loading…'
    : state.source === "oauth"
      ? "Refresh Google"
      : "<span>Google sign-in</span>";
}
function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 3200);
}
function movePeriod(n) {
  if (state.view === "day")
    state.cursor.setUTCDate(state.cursor.getUTCDate() + n);
  else
    state.cursor = new Date(
      Date.UTC(
        state.cursor.getUTCFullYear(),
        state.cursor.getUTCMonth() + n,
        1,
      ),
    );
  refreshPeriod();
}
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      state.view = b.dataset.view;
      document
        .querySelectorAll("[data-view]")
        .forEach((x) => x.classList.toggle("active", x === b));
      render();
    }),
);
$("prevBtn").onclick = () => movePeriod(-1);
$("nextBtn").onclick = () => movePeriod(1);
$("todayBtn").onclick = () => {
  state.cursor = manilaNow();
  refreshPeriod();
};
$("linkBtn").onclick = openLinksDialog;
$("modeFilter").onchange = (e) => {
  state.modeFilter = e.target.value;
  render();
};
$("scopeFilter").onchange = (e) => {
  state.scopeFilter = e.target.value;
  render();
};
function setCalendarMenuOpen(open) {
  $("calendarMenu").hidden = !open;
  $("calFilter").setAttribute("aria-expanded", String(open));
}
$("calFilter").onclick = (e) => {
  e.stopPropagation();
  setCalendarMenuOpen($("calendarMenu").hidden);
};
document.addEventListener("click", (e) => {
  if (!e.target.closest(".relative")) setCalendarMenuOpen(false);
});
$("setupForm").onsubmit = async (e) => {
  e.preventDefault();
  const id = $("clientId").value.trim();
  if (!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)) {
    $("setupError").textContent = "Enter a valid Google OAuth Client ID.";
    $("setupError").style.display = "block";
    return;
  }
  safeWrite("calendar_digest_client_id", id);
  $("setupDialog").close();
  await authorize(id);
};
$("linksForm").onsubmit = async (e) => {
  e.preventDefault();
  const links = [
    ...new Set(
      $("calendarLinks")
        .value.split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
  if (!links.length) {
    $("linksError").textContent = "Paste at least one calendar link.";
    $("linksError").style.display = "block";
    return;
  }
  const complete = await loadLinkedCalendars(links);
  if (complete) $("linksDialog").close();
};

function requestRange() {
  const y = state.cursor.getUTCFullYear(),
    m = state.cursor.getUTCMonth();
  return {
    from: localKey(new Date(Date.UTC(y, m, 1))) + "T00:00:00+08:00",
    to: localKey(new Date(Date.UTC(y, m + 1, 1))) + "T00:00:00+08:00",
  };
}
function monthKey() {
  return state.cursor.getUTCFullYear() + "-" + state.cursor.getUTCMonth();
}
function sourceName(link, index) {
  return DEFAULT_NAMES[DEFAULT_LINKS.indexOf(link)] || `Calendar ${index + 1}`;
}
function renderAvailability() {
  const unavailable = loading || !state.connected;
  $("prevBtn").disabled = loading;
  $("nextBtn").disabled = loading;
  $("todayBtn").disabled = loading;
  if (unavailable) {
    for (const id of [
      "metricEvents",
      "metricHours",
      "metricCalendars",
      "metricFourth",
      "metricConflicts",
    ])
      $(id).textContent = "—";
    $("summaryLead").textContent = loading
      ? "Loading calendar activities…"
      : "Calendar activities could not be loaded.";
    $("insights").textContent = loading
      ? "Retrieving the selected month from Google Calendar."
      : "Reload the page to retry, or check your calendar links and sharing permissions.";
    $("agenda").innerHTML =
      '<div class="empty"><strong>' +
      (loading ? "Loading activities…" : "Calendar data unavailable") +
      "</strong>Your schedule will appear once a calendar is available.</div>";
    $("suggestions").textContent =
      "Suggestions will appear after activities load.";
    $("conflicts").textContent =
      "Conflict checks will appear after activities load.";
    $("conflictCount").textContent = "Not available";
    $("agendaCount").textContent = "Not available";
  }
}
async function loadLinkedCalendars(links, { save = true, quiet = false } = {}) {
  if (links.length > 15) {
    $("linksError").textContent = "Add at most 15 calendars.";
    $("linksError").style.display = "block";
    return false;
  }
  try {
    for (const link of links) {
      const u = new URL(link);
      if (
        u.protocol !== "https:" ||
        u.hostname !== "calendar.google.com" ||
        u.username ||
        u.password ||
        u.port
      )
        throw Error();
    }
  } catch {
    $("linksError").textContent = "Use HTTPS Google Calendar links only.";
    $("linksError").style.display = "block";
    return false;
  }
  const version = ++requestVersion,
    range = requestRange(),
    oldSelected = new Set(state.selected),
    oldIds = new Set(state.calendars.map((c) => c.id));
  activeLinks = [...links];
  state.source = "links";
  loading = true;
  state.connected = false;
  state.events = [];
  sourceResults = links.map((link, i) => ({
    link,
    name: sourceName(link, i),
    loading: true,
  }));
  setLinkLoading(true);
  render();
  const results = await Promise.allSettled(
    links.map(async (link, i) => {
      const response = await fetch("/api/calendar-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link, ...range }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Calendar could not be loaded.");
      const color = COLORS[i % COLORS.length];
      data.calendar.backgroundColor = color;
      data.events.forEach((e) => (e.color = color));
      return data;
    }),
  );
  if (version !== requestVersion) return false;
  const good = [];
  sourceResults = results.map((result, i) => {
    if (result.status === "fulfilled") {
      good.push(result.value);
      return {
        link: links[i],
        name: result.value.calendar.summary,
        count: result.value.events.length,
      };
    }
    return {
      link: links[i],
      name: sourceName(links[i], i),
      error:
        result.reason?.name === "TimeoutError"
          ? "Request timed out. Refresh to retry."
          : result.reason?.message || "Connection failed.",
    };
  });
  state.calendars = [
    ...new Map(good.map((x) => [x.calendar.id, x.calendar])).values(),
  ];
  const seen = new Set();
  state.events = good
    .flatMap((x) => x.events)
    .filter((e) => {
      const key =
        e.calendarId + "|" + e.id + "|" + (e.start.dateTime || e.start.date);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  state.selected = new Set(
    state.calendars
      .filter((c) => !oldIds.has(c.id) || oldSelected.has(c.id))
      .map((c) => c.id),
  );
  state.connected = good.length > 0;
  loadedMonth = monthKey();
  loading = false;
  if (save) safeWrite("calendar_digest_links", JSON.stringify(links));
  const errors = sourceResults.filter((r) => r.error);
  $("sideStatus").textContent =
    `${good.length} of ${links.length} calendars loaded`;
  $("sideDot").classList.toggle("live", good.length > 0);
  $("linksError").textContent = errors
    .map((r) => r.name + ": " + r.error)
    .join("\n");
  $("linksError").style.display = errors.length ? "block" : "none";
  setLinkLoading(false);
  renderCalendarMenu();
  render();
  if (!quiet) toast(`${good.length} of ${links.length} calendars loaded.`);
  return errors.length === 0;
}
async function refreshPeriod(force = false) {
  if (loading) return;
  if (!force && loadedMonth === monthKey()) {
    render();
    return;
  }
  if (state.source === "oauth") {
    loading = true;
    state.events = [];
    render();
    try {
      await loadGoogleData();
      loadedMonth = monthKey();
      state.connected = true;
    } catch (error) {
      state.connected = false;
      toast(error.message);
    } finally {
      loading = false;
      render();
    }
  } else await loadLinkedCalendars(activeLinks, { save: false, quiet: true });
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("calendarMenu").hidden) {
    setCalendarMenuOpen(false);
    $("calFilter").focus();
  }
});
renderCalendarMenu();
render();
loadLinkedCalendars(activeLinks, { save: false, quiet: true });
