// Calendar arithmetic uses UTC fields shifted to Manila, independent of the viewer's timezone.
function manilaNow() {
  return new Date(Date.now() + 8 * 3600000);
}

const DEFAULT_LINKS = [
  "https://calendar.google.com/calendar/embed?src=dilg.lgmed10%40gmail.com&ctz=Asia%2FManila",
  "https://calendar.google.com/calendar/embed?src=rictu.dilg10%40gmail.com&ctz=Asia%2FManila",
  "https://calendar.google.com/calendar/embed?src=rtenplanning%40gmail.com&ctz=Asia%2FManila",
  "https://calendar.google.com/calendar/embed?src=qmsec10dilg%40gmail.com&ctz=Asia%2FManila",
  "https://calendar.google.com/calendar/embed?src=region10personnel%40gmail.com&ctz=Asia%2FManila",
  "https://calendar.google.com/calendar/u/0?cid=ZGlsZzEwcGRtdUBnbWFpbC5jb20",
  "https://calendar.google.com/calendar/embed?src=lgcdd10dilg%40gmail.com&ctz=Asia%2FManila",
];
const DEFAULT_NAMES = [
  "LGMED",
  "RICTU",
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
      [
        "calendar_digest_lgcdd_added",
        "lgcdd10dilg@gmail.com",
        DEFAULT_LINKS[6],
      ],
    ]) {
      if (safeRead(key)) continue;
      const included = activeLinks.some((link) => {
        try {
          const params = new URL(link).searchParams;
          const cid = params.get("cid") || "";
          const id = params.get("src") || (cid.includes("@") ? cid : atob(cid));
          return (
            id.toLowerCase() === calendarId ||
            decodeURIComponent(link).toLowerCase().includes(`/${calendarId}/`)
          );
        } catch {
          return false;
        }
      });
      const canAdd = !included && activeLinks.length < 15;
      if (canAdd) activeLinks.push(calendarLink);
      if (included || canAdd) {
        localStorage.setItem(
          "calendar_digest_links",
          JSON.stringify(activeLinks),
        );
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
  loadedPeriod = "";
const COLORS = [
  "#2563EB",
  "#EA580C",
  "#15803D",
  "#7E22CE",
  "#BE123C",
  "#A16207",
  "#0F766E",
  "#DB2777",
  "#374151",
  "#0891B2",
  "#4D7C0F",
  "#7C2D12",
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
  officeFilter: null,
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
const hexRgba = (hex, alpha) => {
  const value = String(hex || "").replace("#", ""),
    full =
      value.length === 3
        ? value
            .split("")
            .map((x) => x + x)
            .join("")
        : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return `rgba(55,119,214,${alpha})`;
  return `rgba(${parseInt(full.slice(0, 2), 16)},${parseInt(full.slice(2, 4), 16)},${parseInt(full.slice(4, 6), 16)},${alpha})`;
};
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
  const detail = cleanDescription(e.description)
      .replace(/\btraining managers?[’']? checklist\b/gi, "")
      .replace(/\blgrc activity tracker\b/gi, ""),
    s = (e.summary + " " + detail).toLowerCase();
  if (
    /\b(training|workshop|seminar|webinar|orientation|learning session|capacity building)\b/.test(
      s,
    )
  )
    return "Training & Learning";
  if (
    /\b(monitoring|validation|inspection|assessment|audit|compliance check)\b/.test(
      s,
    )
  )
    return "Monitoring & Validation";
  if (/\b(technical assistance|coaching|mentoring|advisory support)\b/.test(s))
    return "Technical Assistance";
  if (
    /\b(consultation|dialogue|focus group|coordination|meeting|conference|call|huddle|committee)\b/.test(
      s,
    )
  )
    return "Meeting & Coordination";
  if (/\b(planning|review|evaluation|strategy|work plan)\b/.test(s))
    return "Planning & Review";
  if (
    /\b(field work|field visit|site visit|travel|deployment|onsite|on-site)\b/.test(
      s,
    )
  )
    return "Field Work & Visit";
  if (/\b(launch|ceremony|celebration|turnover|awarding|program)\b/.test(s))
    return "Program & Ceremony";
  if (
    /\b(report|administrative|documentation|procurement|deadline|submission|submit)\b/.test(
      s,
    )
  )
    return "Administrative";
  return "Other";
};
const plainText = (html) => {
  const d = new DOMParser().parseFromString(html || "", "text/html");
  return (d.body.textContent || "").replace(/\s+/g, " ").trim();
};
function stakeholderCategories(e) {
  if (e.sourceEvents)
    return [...new Set(e.sourceEvents.flatMap(stakeholderCategories))];
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
  if (e.sourceEvents)
    return [...new Set(e.sourceEvents.flatMap(expectedGuests))];
  const text = plainText(e.description || ""),
    pattern =
      /\b(expected guests?|guests?|resource persons?|speakers?|officials involved)\s*[:\-]\s*([^.!?]+)/gi,
    found = [];
  let match;
  while ((match = pattern.exec(text))) found.push(match[2].trim());
  return found.slice(0, 4);
}
function normalizeActivityUrl(value, depth = 0) {
  let clean = String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/^[<(]+|[)>),.;]+$/g, "")
    .trim();
  if (!clean || /\bgoog_\d+\b/i.test(clean) || depth > 2) return "";
  if (/^www\./i.test(clean)) clean = "https://" + clean;
  try {
    const url = new URL(clean);
    if (
      !/^https?:$/.test(url.protocol) ||
      /\bgoog_\d+\b/i.test(decodeURIComponent(url.href))
    )
      return "";
    if (
      /(^|\.)google\.[a-z.]+$/i.test(url.hostname) &&
      url.pathname === "/url"
    ) {
      const target = url.searchParams.get("q") || url.searchParams.get("url");
      if (target) return normalizeActivityUrl(target, depth + 1);
    }
    return url.href;
  } catch {
    return "";
  }
}
function knownLinkLabel(text, url) {
  const context = plainText(text || "").toLowerCase();
  if (/training managers?[’']? checklist/.test(context))
    return "Training Managers Checklist";
  if (/\blgrc activity tracker\b/.test(context)) return "LGRC Activity Tracker";
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (host.includes("meet.google")) return "Google Meet";
  if (host.includes("zoom")) return "Zoom Meeting";
  if (host.includes("teams.microsoft") || host.includes("teams.live"))
    return "Microsoft Teams Meeting";
  if (host.includes("webex")) return "Webex Meeting";
  if (host.includes("docs.google") && /\/spreadsheets\//.test(url))
    return "Google Sheet";
  if (host.includes("docs.google") && /\/forms\//.test(url))
    return "Google Form";
  if (host.includes("docs.google")) return "Google Document";
  if (host.includes("drive.google")) return "Google Drive File";
  return "";
}
function isMeetingUrl(url, context = "") {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {}
  return (
    /meet\.google|zoom\.|teams\.microsoft|teams\.live|webex/.test(host) ||
    /\b(meeting link|join (?:the )?(?:meeting|zoom|google meet|teams|webex)|video conference)\b/i.test(
      context,
    )
  );
}
function activityLinks(e) {
  if (e.sourceEvents) {
    const map = new Map();
    e.sourceEvents.flatMap(activityLinks).forEach((x) => {
      const old = map.get(x.url);
      if (!old || /^Activity link$/i.test(old.label)) map.set(x.url, x);
    });
    return [...map.values()];
  }
  const raw = String(e.description || ""),
    items = new Map(),
    add = (value, label = "", context = "") => {
      const url = normalizeActivityUrl(value);
      if (!url) return;
      const original = plainText(label).trim(),
        informative =
          original &&
          !/^(?:click here|here|link|open|view|https?:|www\.)/i.test(
            original,
          ) &&
          original.length <= 100,
        known = knownLinkLabel((context || "") + " " + original, url),
        explicitKnown = /training managers?[’']? checklist/i.test(original)
          ? "Training Managers Checklist"
          : /\blgrc activity tracker\b/i.test(original)
            ? "LGRC Activity Tracker"
            : "",
        fallback = (() => {
          try {
            return new URL(url).hostname.replace(/^www\./, "");
          } catch {
            return "Activity link";
          }
        })(),
        preferred =
          explicitKnown ||
          (/Checklist|Tracker/.test(known)
            ? known
            : informative
              ? original
              : known || fallback),
        entry = {
          url,
          label: preferred,
          kind: isMeetingUrl(url, (context || "") + " " + original)
            ? "meeting"
            : "resource",
        };
      const old = items.get(url);
      if (
        !old ||
        (!old.label.includes("Checklist") &&
          !old.label.includes("Tracker") &&
          (known || informative))
      )
        items.set(url, entry);
    };
  const box = new DOMParser().parseFromString(raw, "text/html").body;
  box
    .querySelectorAll?.("a[href]")
    .forEach((a) =>
      add(
        a.getAttribute("href"),
        a.textContent,
        a.parentElement?.textContent || "",
      ),
    );
  [...raw.matchAll(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi)].forEach((m) => {
    const before = plainText(raw.slice(Math.max(0, m.index - 140), m.index)),
      after = plainText(raw.slice(m.index, m.index + m[0].length + 80)),
      tail = before
        .split(/[.!?\n|]/)
        .pop()
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      labelMatch = tail.match(
        /([A-Za-z][A-Za-z0-9 &'’()\/-]{2,70})\s*[:\-]?\s*$/,
      );
    add(m[0], labelMatch?.[1] || "", tail + " " + after);
  });
  return [...items.values()].slice(0, 8);
}
function meetingLinks(e) {
  return activityLinks(e).filter((x) => x.kind === "meeting");
}
function descriptionWithBreaks(raw) {
  const marker = " __CAL_BREAK__ ",
    marked = String(raw || "").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, marker),
    text = plainText(marked);
  return text.replaceAll("__CAL_BREAK__", "\n");
}
function meetingAccessDetails(e) {
  if (e.sourceEvents) {
    const map = new Map();
    e.sourceEvents
      .flatMap(meetingAccessDetails)
      .forEach((x) =>
        map.set(x.label.toLowerCase() + "|" + x.value.toLowerCase(), x),
      );
    return [...map.values()];
  }
  const text = descriptionWithBreaks(e.description),
    out = [],
    seen = new Set(),
    add = (label, value) => {
      const clean = String(value || "")
        .trim()
        .replace(/[),.;]+$/, "");
      if (!clean) return;
      const key = label.toLowerCase() + "|" + clean.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ label, value: clean });
      }
    };
  let m;
  const idPattern =
      /\b(?:meeting\s*(?:id|number|no\.?|code)|webinar\s*id|conference\s*id)\s*[:#\-]?\s*([0-9](?:[0-9\s-]{4,30})[0-9])/gi,
    passPattern =
      /\b(?:pass\s*code|passcode|meeting\s*password|password|pwd|pin)\s*[:#\-]?\s*([A-Za-z0-9][A-Za-z0-9@#$%^&*+_.!\-]{1,39})/gi;
  while ((m = idPattern.exec(text)))
    add("Meeting ID", m[1].replace(/\s+/g, " ").trim());
  while ((m = passPattern.exec(text))) add("Passcode", m[1]);
  return out.slice(0, 6);
}
function meetingCredentials(e) {
  const details = meetingAccessDetails(e);
  return (
    details.some((x) => x.label === "Meeting ID") &&
    details.some((x) => x.label === "Passcode")
  );
}
function participantCount(e) {
  if (e.sourceEvents)
    return Math.max(0, ...e.sourceEvents.map(participantCount));
  const text = plainText(e.description || ""),
    patterns = [
      /(\d{1,5})\s*(?:pax|participants?|attendees?|delegates?)\b/gi,
      /\bpax\s*[:\-]?\s*(\d{1,5})\b/gi,
      /(?:number|no\.?)(?:\s+of)?\s+(?:participants?|attendees?)\s*[:\-]?\s*(\d{1,5})\b/gi,
    ],
    values = [];
  patterns.forEach((p) => {
    let m;
    while ((m = p.exec(text))) values.push(Number(m[1]));
  });
  return values.length ? Math.max(...values) : 0;
}
function cleanDescription(raw) {
  return plainText(
    String(raw || "")
      .replace(/<br\s*\/?>/gi, ". ")
      .replace(/<\/p>/gi, ". "),
  )
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(
      /\b(?:meeting\s*(?:id|number|no\.?|code)|webinar\s*id|conference\s*id|pass\s*code|passcode|meeting password|password|pwd|access code|pin|dial[- ]?in|join (?:zoom|google meet|teams|the meeting))\s*[:\-]?\s*[^.!?]*/gi,
      " ",
    )
    .replace(/\b\+?\d[\d ()-]{8,}\d\b/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
function cleanVenue(raw) {
  let v = plainText(raw || "")
    .replace(/^(?:venue|location|place|platform)\s*[:\-]\s*/i, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!v) return "Not specified";
  if (/zoom/i.test(v)) return "Zoom";
  if (/google meet|meet\.google/i.test(v)) return "Google Meet";
  if (/microsoft teams|teams\.microsoft/i.test(v)) return "Microsoft Teams";
  if (/webex/i.test(v)) return "Webex";
  v = v.split(/[|;]/)[0].trim();
  if (v.includes(",")) v = v.split(",")[0].trim();
  return v || "Not specified";
}
function platformFromLink(value) {
  const url = typeof value === "string" ? value : value?.url;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("zoom")) return "Zoom";
    if (host.includes("meet.google")) return "Google Meet";
    if (host.includes("teams.microsoft") || host.includes("teams.live"))
      return "Microsoft Teams";
    if (host.includes("webex")) return "Webex";
    return "Online meeting";
  } catch {
    return "Online meeting";
  }
}
function venueOf(e) {
  const direct = cleanVenue(e.location);
  if (direct !== "Not specified") return direct;
  const text = cleanDescription(e.description),
    match = text.match(
      /\b(?:venue|location|place|platform)\s*[:\-]\s*([^.!?]+)/i,
    );
  if (match) return cleanVenue(match[1]);
  const links = meetingLinks(e);
  if (meetingCredentials(e) && links.length) return platformFromLink(links[0]);
  return meetingCredentials(e) ? "Online meeting" : "Not specified";
}
function deliveryMode(e) {
  const text = (
      " " +
      [e.summary, e.description, e.location].filter(Boolean).join(" ") +
      " "
    ).toLowerCase(),
    completeAccess = meetingCredentials(e),
    explicitHybrid =
      /\b(hybrid|blended|onsite\s+and\s+online|face[- ]to[- ]face\s+and\s+online)\b/i.test(
        text,
      ),
    onsiteWords =
      /\b(f2f|face[- ]to[- ]face|in[- ]person|on[- ]site|onsite|physical attendance|hotel|function room|conference (?:room|hall|center)|training (?:room|center)|regional office|provincial office|city hall|municipal hall|barangay hall)\b/i.test(
        text,
      ),
    venue = venueOf(e),
    physicalVenue =
      venue !== "Not specified" &&
      ![
        "Zoom",
        "Google Meet",
        "Microsoft Teams",
        "Webex",
        "Online meeting",
      ].includes(venue),
    onsite = onsiteWords || physicalVenue;
  if (completeAccess && (explicitHybrid || onsite)) return "Hybrid";
  if (completeAccess) return "Online";
  if (onsite) return "Face-to-face";
  return "Unspecified";
}
function eventLevel(e) {
  const title = (" " + (e.summary || "") + " ").toLowerCase(),
    detail = (
      " " +
      [e.description, e.location].filter(Boolean).join(" ") +
      " "
    ).toLowerCase(),
    origin = (" " + (e.calendarName || "") + " ").toLowerCase(),
    regional =
      /\b(regional|region x|region 10|regional director|ord|oard|lgmed|lgcdd|rictu)\b/i,
    field =
      /\b(field office|field personnel|provincial office|provincial director|huc|city office|city director|municipal|mlgoo|clgoo|lgoo|barangay|fou)\b/i;
  if (regional.test(title)) return "Regional";
  if (field.test(title)) return "Field Office";
  if (regional.test(detail)) return "Regional";
  if (field.test(detail)) return "Field Office";
  if (regional.test(origin)) return "Regional";
  if (field.test(origin)) return "Field Office";
  return "Unspecified";
}
const normWords = (value) =>
  new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 2 &&
          ![
            "the",
            "and",
            "for",
            "with",
            "from",
            "this",
            "that",
            "activity",
            "event",
            "calendar",
            "schedule",
          ].includes(w),
      ),
  );
function setSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  a.forEach((x) => {
    if (b.has(x)) common++;
  });
  return common / (a.size + b.size - common);
}
const textSimilarity = (a, b) => setSimilarity(normWords(a), normWords(b));
const normalizedName = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
function labeledNames(e, labels) {
  const text = cleanDescription(e.description),
    pattern = new RegExp("\\b(" + labels + ")\\s*[:\\-]\\s*([^.!?]+)", "gi"),
    out = [];
  let m;
  while ((m = pattern.exec(text)))
    m[2]
      .split(/,|;|\band\b/i)
      .map((x) => x.replace(/\s*[|/]\s*(?:\+?\d|\S+@).*$/, "").trim())
      .filter(
        (x) =>
          x &&
          x.length < 80 &&
          !/^\d+\s*(?:pax|participants?|attendees?)?$/i.test(x),
      )
      .forEach((x) => out.push(x));
  return out;
}
function facilitators(e) {
  if (e.facilitatorNames) return e.facilitatorNames;
  return [
    ...new Set(
      [
        e.organizer?.displayName || e.organizer?.email,
        ...labeledNames(
          e,
          "facilitators?|resource persons?|speakers?|trainers?|presenters?",
        ),
      ]
        .filter(Boolean)
        .map((x) => normalizedName(x)),
    ),
  ];
}
function participants(e) {
  if (e.sourceEvents) return [...new Set(e.sourceEvents.flatMap(participants))];
  return [
    ...new Set(
      [
        ...(e.attendees || []).map((a) => a.displayName || a.email),
        ...labeledNames(
          e,
          "participants?|attendees?|expected guests?|guests?|delegates?|pax",
        ),
      ]
        .filter(Boolean)
        .map((x) => normalizedName(x)),
    ),
  ];
}
function contactPersons(e) {
  if (e.sourceEvents)
    return [...new Set(e.sourceEvents.flatMap(contactPersons))];
  return [
    ...new Set(
      labeledNames(
        e,
        "activity focal(?: person)?|focal person|contact person|point person|activity coordinator|coordinator|secretariat",
      )
        .map(normalizedName)
        .filter(Boolean),
    ),
  ];
}
function uniqueLabels(values) {
  const map = new Map();
  values.filter(Boolean).forEach((x) => {
    const value = String(x).trim(),
      key = normalizedName(value);
    if (key && !map.has(key)) map.set(key, value);
  });
  return [...map.values()];
}
function hostAgencies(e) {
  if (e.sourceEvents) return uniqueLabels(e.sourceEvents.flatMap(hostAgencies));
  return uniqueLabels(
    labeledNames(
      e,
      "host agency|host office|hosting agency|organizing agency|lead agency|convenor",
    ),
  );
}
function staffInvolved(e) {
  if (e.sourceEvents)
    return uniqueLabels(e.sourceEvents.flatMap(staffInvolved));
  return uniqueLabels(
    labeledNames(
      e,
      "staff involved|personnel involved|dilg staff involved|assigned staff|team members",
    ),
  );
}
const humanName = (value) =>
  String(value || "").replace(/\b\w/g, (c) => c.toUpperCase());
function nameOverlap(a, b) {
  const A = new Set(a),
    B = new Set(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  A.forEach((x) => {
    if (B.has(x)) n++;
  });
  return n / Math.min(A.size, B.size);
}
function officeName(value) {
  let name = String(value || "Unknown office").trim();
  if (/^[^@\s]+@[^@\s]+$/.test(name))
    name = name.split("@")[0].replace(/[._-]+/g, " ");
  return (
    name
      .replace(/\s+(calendar|activities|events|schedule)$/i, "")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim() || "Unknown Office"
  );
}
function sourceOffice(e) {
  return officeName(e.calendarName || e.calendarOwner || e.calendarId);
}
function officeColorById(id) {
  return state.calendars.find((c) => c.id === id)?.backgroundColor || COLORS[0];
}
function officeColorByName(name) {
  return (
    state.calendars.find((c) => officeName(c.summary) === name)
      ?.backgroundColor || COLORS[0]
  );
}
function eventOfficeColors(e) {
  return [...new Set((e.calendarIds || [e.calendarId]).map(officeColorById))];
}
function officeRowBackground(colors) {
  const list = colors.length ? colors : [COLORS[0]];
  if (list.length === 1) return hexRgba(list[0], 0.12);
  const size = 100 / list.length,
    stops = list.flatMap((color, index) => [
      `${hexRgba(color, 0.13)} ${(index * size).toFixed(2)}%`,
      `${hexRgba(color, 0.13)} ${((index + 1) * size).toFixed(2)}%`,
    ]);
  return `linear-gradient(90deg,${stops.join(",")})`;
}
function duplicateScore(a, b) {
  if (
    a.calendarId === b.calendarId ||
    localKey(eventDate(a)) !== localKey(eventDate(b))
  )
    return 0;
  const title = textSimilarity(a.summary, b.summary),
    startGap = Math.abs(eventDate(a) - eventDate(b)) / 6e4,
    time =
      startGap <= 15
        ? 1
        : startGap <= 60
          ? 0.65
          : eventDate(a) < eventEnd(b) && eventDate(b) < eventEnd(a)
            ? 0.4
            : 0,
    venue = textSimilarity(venueOf(a), venueOf(b)),
    fac = nameOverlap(facilitators(a), facilitators(b)),
    part = nameOverlap(participants(a), participants(b)),
    contact = nameOverlap(contactPersons(a), contactPersons(b));
  if (title < 0.35 || !time) return 0;
  return (
    title * 0.44 +
    time * 0.18 +
    venue * 0.1 +
    fac * 0.1 +
    part * 0.1 +
    contact * 0.08
  );
}
function mergeGroup(group) {
  const best = [...group].sort(
      (a, b) =>
        cleanDescription(b.description).length +
        (b.summary || "").length -
        (cleanDescription(a.description).length + (a.summary || "").length),
    )[0],
    attendees = [],
    seenPeople = new Set();
  group
    .flatMap((e) => e.attendees || [])
    .forEach((a) => {
      const k = normalizedName(a.email || a.displayName);
      if (k && !seenPeople.has(k)) {
        seenPeople.add(k);
        attendees.push(a);
      }
    });
  const offices = [...new Set(group.map(sourceOffice))],
    locations = group.map(venueOf).filter((v) => v !== "Not specified"),
    location =
      locations.sort(
        (a, b) =>
          locations.filter((x) => x === b).length -
          locations.filter((x) => x === a).length,
      )[0] || "";
  return {
    ...best,
    id:
      "merged-" +
      group
        .map((e) => e.id)
        .sort()
        .join("-"),
    summary: best.summary,
    description: best.description,
    location,
    start: group.reduce(
      (x, e) => (eventDate(e) < eventDate(x) ? e : x),
      group[0],
    ).start,
    end: group.reduce((x, e) => (eventEnd(e) > eventEnd(x) ? e : x), group[0])
      .end,
    attendees,
    facilitatorNames: [...new Set(group.flatMap(facilitators))],
    calendarIds: [...new Set(group.map((e) => e.calendarId))],
    offices,
    calendarName: offices.join(", "),
    sourceEvents: group,
    sourceCount: group.length,
    mergedCount: group.length - 1,
  };
}
function mergeDuplicateActivities(events) {
  const n = events.length,
    parent = Array.from({ length: n }, (_, i) => i),
    find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x]))),
    join = (a, b) => {
      a = find(a);
      b = find(b);
      if (a !== b) parent[b] = a;
    },
    sorted = events
      .map((e, i) => ({ e, i }))
      .sort((a, b) => eventDate(a.e) - eventDate(b.e));
  for (let x = 0; x < sorted.length; x++)
    for (let y = x + 1; y < sorted.length; y++) {
      if (localKey(eventDate(sorted[x].e)) !== localKey(eventDate(sorted[y].e)))
        break;
      const score = duplicateScore(sorted[x].e, sorted[y].e),
        title = textSimilarity(sorted[x].e.summary, sorted[y].e.summary);
      if (score >= 0.64 || (score >= 0.55 && title >= 0.78))
        join(sorted[x].i, sorted[y].i);
    }
  const groups = new Map();
  events.forEach((e, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(e);
  });
  return [...groups.values()]
    .map(mergeGroup)
    .sort((a, b) => eventDate(a) - eventDate(b));
}
function activitySummary(e) {
  const mode = deliveryMode(e),
    venue = venueOf(e),
    level = eventLevel(e),
    groups = stakeholderCategories(e).filter(
      (x) => x !== "Other / Unspecified",
    ),
    title = String(e.summary || "Activity").trim(),
    leads = facilitators(e).slice(0, 2).map(humanName),
    contacts = contactPersons(e).slice(0, 2).map(humanName),
    hosts = hostAgencies(e),
    staff = staffInvolved(e),
    people = participants(e),
    pax = participantCount(e),
    resources = activityLinks(e).filter((x) => x.kind === "resource"),
    access = meetingAccessDetails(e),
    completeAccess = meetingCredentials(e),
    formatText =
      mode === "Unspecified"
        ? "has no stated delivery format"
        : `will be conducted ${mode === "Face-to-face" ? "face-to-face" : mode.toLowerCase()}`;
  const parts = [
    `${title} is classified as ${category(e).toLowerCase()} and ${formatText}${level !== "Unspecified" ? " at the " + level.toLowerCase() + " level" : ""}.`,
  ];
  if (venue !== "Not specified")
    parts.push(`${mode === "Online" ? "Platform" : "Venue"}: ${venue}.`);
  if (hosts.length) parts.push(`Host agency: ${hosts.slice(0, 3).join(", ")}.`);
  if (groups.length)
    parts.push(`Stakeholders identified: ${groups.slice(0, 4).join(", ")}.`);
  if (leads.length) parts.push(`Led or organized by ${leads.join(" and ")}.`);
  if (contacts.length)
    parts.push(`Activity focal or contact: ${contacts.join(" and ")}.`);
  if (staff.length)
    parts.push(`Staff involved: ${staff.slice(0, 5).join(", ")}.`);
  if (pax) parts.push(`Indicated participation: ${pax} pax.`);
  else if (people.length)
    parts.push(
      `${people.length} named ${people.length === 1 ? "participant or guest is" : "participants or guests are"} associated with the activity.`,
    );
  if (completeAccess)
    parts.push("A complete Meeting ID and passcode are provided.");
  else if (access.length)
    parts.push(
      "Only partial meeting credentials were found, so they were not used to classify this activity as online or hybrid.",
    );
  if (resources.length)
    parts.push(
      `Activity resources available: ${resources
        .slice(0, 3)
        .map((x) => x.label)
        .join(", ")}.`,
    );
  return parts.join(" ");
}
function findConflicts(ev) {
  const timed = ev.filter((e) => !isAllDay(e)),
    pairs = [];
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i],
        b = timed[j];
      if (eventDate(a) < eventEnd(b) && eventDate(b) < eventEnd(a)) {
        const sharedFac = facilitators(a).filter((x) =>
            facilitators(b).includes(x),
          ),
          sharedPart = participants(a).filter((x) =>
            participants(b).includes(x),
          ),
          start = new Date(Math.max(eventDate(a), eventDate(b))),
          end = new Date(Math.min(eventEnd(a), eventEnd(b)));
        pairs.push({
          a,
          b,
          start,
          end,
          sharedFac,
          sharedPart,
          basis: sharedFac.length
            ? "Shared facilitator"
            : sharedPart.length
              ? "Shared participant"
              : "Time overlap",
        });
      }
    }
  return pairs;
}

function startOfWeek(d) {
  const start = startOfDay(d);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}
function endOfWeek(d) {
  const end = startOfWeek(d);
  end.setUTCDate(end.getUTCDate() + 6);
  return endOfDay(end);
}
function range() {
  if (state.view === "week")
    return [startOfWeek(state.cursor), endOfWeek(state.cursor)];
  if (state.view === "day")
    return [startOfDay(state.cursor), endOfDay(state.cursor)];
  if (state.view === "year")
    return [
      new Date(Date.UTC(state.cursor.getUTCFullYear(), 0, 1)),
      new Date(Date.UTC(state.cursor.getUTCFullYear() + 1, 0, 1) - 1),
    ];
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
function currentEvents({ ignoreGroup = false, ignoreOffice = false } = {}) {
  const [a, b] = range();
  // Filter source calendars first so excluded offices cannot affect merged totals.
  const reports = state.events.filter(
    (e) =>
      state.selected.has(e.calendarId) &&
      eventDate(e) <= b &&
      eventEnd(e) > a &&
      e.status !== "cancelled",
  );
  return mergeDuplicateActivities(reports).filter(
    (e) =>
      (state.modeFilter === "all" || deliveryMode(e) === state.modeFilter) &&
      (state.scopeFilter === "all" || eventLevel(e) === state.scopeFilter) &&
      (ignoreOffice ||
        !state.officeFilter ||
        e.offices.includes(state.officeFilter)) &&
      (ignoreGroup ||
        state.groupFilter === "all" ||
        stakeholderCategories(e).includes(state.groupFilter)),
  );
}
function render() {
  const ev = currentEvents(),
    [a, b] = range(),
    unique = new Set(ev.flatMap((e) => e.offices)).size,
    conflicts = findConflicts(ev);
  $("pageTitle").textContent =
    state.view === "day"
      ? "Today’s activity"
      : state.view === "week"
        ? "Weekly activity"
        : state.view === "year"
          ? "Annual activity summary"
          : "Monthly activity";
  $("subtitle").textContent =
    state.view === "day"
      ? "A clear view of where your day is going."
      : state.view === "week"
        ? "Activities and analytics for the selected week."
        : state.view === "year"
          ? "Activities and analytics for the entire year."
          : "Patterns and scheduled workload at a glance.";
  $("periodTitle").textContent =
    state.view === "week"
      ? `${fmtDate(a, { month: "short", day: "numeric", year: "numeric" })} – ${fmtDate(b, { month: "short", day: "numeric", year: "numeric" })}`
      : state.view === "day"
        ? fmtDate(a, {
            weekday: "short",
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : fmtDate(
            a,
            state.view === "year"
              ? { year: "numeric" }
              : { month: "long", year: "numeric" },
          );
  $("metricEvents").textContent = ev.length;
  $("metricMerged").textContent = ev.filter((e) => e.mergedCount > 0).length;
  $("metricOffices").textContent = unique;
  $("metricConcurrent").textContent = conflicts.length;
  $("metricEventsNote").textContent = "unique activities after consolidation";
  $("metricFourthLabel").textContent = "Categories";
  $("metricFourth").textContent = new Set(ev.map(category)).size;
  $("metricFourthNote").textContent = "activity categories represented";
  renderSummary(ev, conflicts, ev.filter((e) => e.mergedCount > 0).length);
  renderBreakdown(ev);
  renderAnalytics(ev);
  renderOfficeTiles(currentEvents({ ignoreOffice: true }));
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
function renderSummary(ev, concurrent, duplicates) {
  $("summaryMode").textContent =
    state.view === "day"
      ? "Daily summary"
      : state.view === "week"
        ? "Weekly summary"
        : state.view === "month"
          ? "Monthly summary"
          : "Annual summary";
  const cats = ev.reduce(
      (o, e) => ((o[category(e)] = (o[category(e)] || 0) + 1), o),
      {},
    ),
    top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0],
    allDay = ev.filter(isAllDay).length;
  if (!ev.length) {
    $("summaryLead").textContent =
      "No activities were found for this period and filter set.";
    $("insights").innerHTML =
      '<div class="insight"><span class="bullet"></span><span>Adjust the office, format, event-level, or organization filter to widen the results.</span></div>';
    return;
  }
  const officeCount = new Set(ev.flatMap((e) => e.offices)).size,
    period =
      state.view === "day"
        ? "today"
        : state.view === "week"
          ? "this week"
          : state.view === "month"
            ? "this month"
            : "this year";
  $("summaryLead").textContent =
    `${ev.length} unique ${ev.length === 1 ? "activity" : "activities"} ${period} across ${officeCount} reporting ${officeCount === 1 ? "office" : "offices"}.`;
  const bits = [];
  if (duplicates)
    bits.push(
      `<b>${duplicates} ${duplicates === 1 ? "activity has" : "activities have"} possible duplicate entries</b> from different office calendars and ${duplicates === 1 ? "is" : "are"} shown once.`,
    );
  if (concurrent.length)
    bits.push(
      `<b>${concurrent.length} concurrent ${concurrent.length === 1 ? "pair is" : "pairs are"} running at overlapping times</b>${concurrent.some((x) => x.sharedFac.length || x.sharedPart.length) ? ", including shared facilitators or participants." : "."}`,
    );
  if (top)
    bits.push(
      `<b>${esc(top[0])}</b> is the largest activity category with ${top[1]} ${top[1] === 1 ? "activity" : "activities"}.`,
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
  if (state.view === "year") {
    const months = ev.reduce((o, e) => {
        const k = fmtDate(eventDate(e), { month: "long" });
        o[k] = (o[k] || 0) + 1;
        return o;
      }, {}),
      peak = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
    if (peak)
      bits.push(
        `<b>${esc(peak[0])}</b> has the highest activity count at ${peak[1]}.`,
      );
  } else if (state.view === "month" || state.view === "week") {
    const best = Object.entries(byDay(ev)).sort((a, b) => b[1] - a[1])[0];
    if (best)
      bits.push(
        `<b>${fmtDate(new Date(best[0] + "T00:00:00Z"), { weekday: "long", month: "long", day: "numeric" })}</b> is the busiest day with ${best[1]} activities.`,
      );
  }
  if (allDay)
    bits.push(
      `${allDay} all-day ${allDay === 1 ? "activity is" : "activities are"} included.`,
    );
  $("insights").innerHTML = bits
    .slice(0, 3)
    .map(
      (x) =>
        `<div class="insight"><span class="bullet"></span><span>${x}</span></div>`,
    )
    .join("");
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
    venueMap = new Map();
  ev.forEach((e) => {
    const v = venueOf(e);
    if (
      v === "Not specified" ||
      [
        "Zoom",
        "Google Meet",
        "Microsoft Teams",
        "Webex",
        "Online",
        "Online meeting",
      ].includes(v)
    )
      return;
    if (!venueMap.has(v)) venueMap.set(v, { count: 0, offices: new Set() });
    const row = venueMap.get(v);
    row.count++;
    e.offices.forEach((o) => row.offices.add(o));
  });
  const venues = [...venueMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  $("analytics").innerHTML =
    `<section class="analytics-block"><h3>Delivery format</h3>${analyticRows(modes, ev.length)}</section><section class="analytics-block"><h3>Event level</h3>${analyticRows(levels, ev.length)}</section><section class="analytics-block"><h3>Most-used physical venues</h3>${venues.length ? venues.map(([v, row]) => `<div class="venue-row"><b title="${esc(v)}">${esc(v)}</b><span>${row.count} ${row.count === 1 ? "activity" : "activities"} · ${row.offices.size} ${row.offices.size === 1 ? "office" : "offices"}</span></div>`).join("") : '<div class="empty"><strong>No physical venue data</strong></div>'}</section>`;
}
function renderOfficeTiles(ev) {
  const counts = ev
    .flatMap((e) => e.offices)
    .reduce((o, k) => ((o[k] = (o[k] || 0) + 1), o), Object.create(null));
  // Keep the selected office available to clear even when other filters hide it.
  if (state.officeFilter && !counts[state.officeFilter])
    counts[state.officeFilter] = 0;
  const items = Object.entries(counts).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  $("officeTiles").innerHTML =
    items
      .map(
        ([name, count]) =>
          `<button class="office-box ${state.officeFilter === name ? "active" : ""}" aria-pressed="${state.officeFilter === name}" data-office="${esc(name)}" style="--office-color:${officeColorByName(name)};--office-tint:${hexRgba(officeColorByName(name), 0.11)};--office-border:${hexRgba(officeColorByName(name), 0.32)};--office-ring:${hexRgba(officeColorByName(name), 0.16)}" title="Filter activities from ${esc(name)}"><strong>${count}</strong><span>${esc(name)}</span></button>`,
      )
      .join("") ||
    '<div class="empty"><strong>No office activity found</strong>The originating calendar determines the office or division.</div>';
  document.querySelectorAll("[data-office]").forEach(
    (b) =>
      (b.onclick = () => {
        const office = b.dataset.office;
        state.officeFilter = state.officeFilter === office ? null : office;
        render();
        [...$("officeTiles").querySelectorAll("[data-office]")]
          .find((item) => item.dataset.office === office)
          ?.focus();
      }),
  );
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
  $("groupFilterStatus").textContent =
    state.groupFilter === "all"
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
    .find((item) => item.dataset.group === group)
    ?.focus();
});
function renderConflicts(pairs) {
  $("conflictCount").textContent = pairs.length
    ? `${pairs.length} concurrent pairs`
    : "No concurrent activities";
  $("conflicts").innerHTML = pairs.length
    ? pairs
        .map((x) => {
          const shared = [...x.sharedFac, ...x.sharedPart]
            .slice(0, 3)
            .join(", ");
          return `<div class="conflict-item"><span class="conflict-time">${fmtDate(x.start, { month: "short", day: "numeric" })}<br>${fmtDate(x.start, { hour: "numeric", minute: "2-digit" })}–${fmtDate(x.end, { hour: "numeric", minute: "2-digit" })}</span><div class="conflict-pair"><strong>${esc(x.a.summary)} ↔ ${esc(x.b.summary)}</strong>${esc(x.a.offices.join(", "))} and ${esc(x.b.offices.join(", "))}${shared ? ` · Shared: ${esc(shared)}` : ""}</div><span class="conflict-badge">${esc(x.basis)}</span></div>`;
        })
        .join("")
    : '<div class="empty"><strong>No concurrent activities</strong>No different activities run at overlapping times in this period.</div>';
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
    state.view === "day"
      ? "Daily activities"
      : state.view === "week"
        ? "All weekly activities"
        : state.view === "year"
          ? "All annual activities"
          : "All monthly activities";
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
  const time = isAllDay(e)
      ? "All day"
      : fmtDate(eventDate(e), { hour: "numeric", minute: "2-digit" }) +
        "–" +
        fmtDate(eventEnd(e), { hour: "numeric", minute: "2-digit" }),
    people = peopleInvolved(e),
    guests = expectedGuests(e),
    groups = stakeholderCategories(e),
    contacts = contactPersons(e).map(humanName),
    hosts = hostAgencies(e),
    staff = staffInvolved(e),
    links = activityLinks(e),
    access = meetingAccessDetails(e),
    pax = participantCount(e),
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
            : "",
    officeColors = eventOfficeColors(e),
    primaryColor = officeColors[0],
    rowBackground = officeRowBackground(officeColors);
  const peopleText = people.length
      ? people
          .slice(0, 8)
          .map((p) => `${esc(p.name)}${p.role ? " (" + esc(p.role) + ")" : ""}`)
          .join(", ")
      : "No named attendee list is available.",
    linksHtml = links
      .map((link) => {
        let domain = "";
        try {
          domain = new URL(link.url).hostname.replace(/^www\./, "");
        } catch {}
        return `<div class="detail-link"><a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)}</a>${domain ? `<small>${esc(domain)}</small>` : ""}</div>`;
      })
      .join(""),
    accessText = access
      .map((x) => `<strong>${esc(x.label)}:</strong> ${esc(x.value)}`)
      .join(" · "),
    completeAccess = meetingCredentials(e);
  return `<details class="event-wrap" style="--office-color:${primaryColor};--office-border:${hexRgba(primaryColor, 0.34)}"><summary class="event" style="background:${rowBackground}"><span class="event-time">${time}</span><div><div class="event-title">${esc(e.summary || "(No title)")}</div><div class="event-meta">${esc(e.offices.join(", "))} · ${esc(venue)}${e.mergedCount ? ` · Possible duplicate across ${e.sourceCount} office calendars` : ""}</div></div><span class="event-badges"><span class="pill ${modeClass}">${esc(mode)}</span><span class="pill">${esc(level)}</span>${e.mergedCount ? '<span class="pill duplicate">Possible duplicate</span>' : ""}</span></summary><div class="event-extra"><p><strong>Activity analysis:</strong> ${esc(activitySummary(e))}</p><p><strong>Originating division/office${e.offices.length === 1 ? "" : "s"}:</strong> ${esc(e.offices.join(", "))}</p>${e.mergedCount ? `<p><strong>Possible duplicate match:</strong> ${e.sourceCount} entries from different office calendars appear to refer to the same activity and are displayed once.</p>` : ""}<p><strong>Venue/platform:</strong> ${esc(venue)} · <strong>Format:</strong> ${esc(mode)} · <strong>Event level:</strong> ${esc(level)}</p>${hosts.length ? `<p><strong>Host agency:</strong> ${esc(hosts.join(", "))}</p>` : ""}<p><strong>Facilitator${facilitators(e).length === 1 ? "" : "s"}:</strong> ${facilitators(e).length ? esc(facilitators(e).map(humanName).join(", ")) : "Not specified"}</p>${contacts.length ? `<p><strong>Activity focal/contact:</strong> ${esc(contacts.join(", "))}</p>` : ""}${staff.length ? `<p><strong>Staff involved:</strong> ${esc(staff.join(", "))}</p>` : ""}<p><strong>Participants:</strong> ${pax ? `${pax} pax indicated · ` : ""}${peopleText}${accepted || pending ? ` · ${accepted} accepted${pending ? ", " + pending + " awaiting response" : ""}` : ""}</p>${guests.length ? `<p><strong>Expected guests:</strong> ${guests.map(esc).join("; ")}</p>` : ""}${accessText ? `<p><strong>${completeAccess ? "Meeting access" : "Meeting access (incomplete)"}:</strong> ${accessText}${completeAccess ? "" : " · Not used for online/hybrid classification"}</p>` : ""}${linksHtml ? `<p><strong>Activity links:</strong></p><div class="detail-links">${linksHtml}</div>` : ""}<div class="event-tags"><span class="tag">${esc(category(e))}</span>${groups.map((g) => `<span class="tag">${esc(g)}</span>`).join("")}${e.mergedCount ? '<span class="tag duplicate">Possible duplicate activity</span>' : ""}</div></div></details>`;
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
          .find((input) => input.dataset.cal === el.dataset.cal)
          ?.focus();
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
  $("importLinksBtn").disabled = on;
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
    backgroundColor: COLORS[i % COLORS.length],
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
  loadedPeriod = periodKey();
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
  if (loading) return;
  if (state.view === "day")
    state.cursor.setUTCDate(state.cursor.getUTCDate() + n);
  else if (state.view === "week")
    state.cursor.setUTCDate(state.cursor.getUTCDate() + n * 7);
  else if (state.view === "year")
    state.cursor = new Date(Date.UTC(state.cursor.getUTCFullYear() + n, 0, 1));
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
      if (loading) return;
      state.view = b.dataset.view;
      document
        .querySelectorAll("[data-view]")
        .forEach((x) => x.classList.toggle("active", x === b));
      refreshPeriod();
    }),
);
$("prevBtn").onclick = () => movePeriod(-1);
$("nextBtn").onclick = () => movePeriod(1);
$("todayBtn").onclick = () => {
  if (loading) return;
  state.cursor = manilaNow();
  refreshPeriod();
};
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
  const [start, end] = range();
  // Fetch the complete boundary week without exceeding the API's 366-day limit.
  if (
    state.view === "week" &&
    start.getUTCFullYear() !== end.getUTCFullYear()
  ) {
    const exclusiveEnd = startOfDay(end);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    return {
      from: localKey(start) + "T00:00:00+08:00",
      to: localKey(exclusiveEnd) + "T00:00:00+08:00",
    };
  }
  const year = state.cursor.getUTCFullYear();
  return {
    from: localKey(new Date(Date.UTC(year, 0, 1))) + "T00:00:00+08:00",
    to: localKey(new Date(Date.UTC(year + 1, 0, 1))) + "T00:00:00+08:00",
  };
}
function periodKey() {
  const { from, to } = requestRange();
  return `${from}/${to}`;
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
      "metricMerged",
      "metricOffices",
      "metricFourth",
      "metricConcurrent",
    ])
      $(id).textContent = "—";
    $("summaryLead").textContent = loading
      ? "Loading calendar activities…"
      : "Calendar activities could not be loaded.";
    $("insights").textContent = loading
      ? "Retrieving the selected period from Google Calendar."
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
  loadedPeriod = periodKey();
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
  if (!force && loadedPeriod === periodKey()) {
    render();
    return;
  }
  if (state.source === "oauth") {
    loading = true;
    state.events = [];
    render();
    try {
      await loadGoogleData();
      loadedPeriod = periodKey();
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
