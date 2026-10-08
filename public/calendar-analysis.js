// Pure analysis shared by the worker and the browser fallback.
const words = value => new Set(String(value || "").toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(word => word.length > 2 &&
    !["the", "and", "for", "with", "from", "this", "that", "activity", "event", "calendar", "schedule"].includes(word)));

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const value of a) if (b.has(value)) common++;
  return common / (a.size + b.size - common);
}
function nameOverlap(a, b) {
  const left = new Set(a), right = new Set(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const value of left) if (right.has(value)) common++;
  return common / Math.min(left.size, right.size);
}

export function groupDuplicates(events) {
  const parent = events.map((_, index) => index);
  const find = index => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const sorted = events.map((event, index) => ({ ...event, index,
    titleWords: words(event.summary), venueWords: words(event.venue) }))
    .sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (a.day !== b.day) break;
      if (a.calendarId === b.calendarId) continue;
      const title = similarity(a.titleWords, b.titleWords);
      if (title < 0.35) continue;
      const gap = Math.abs(a.start - b.start) / 60000;
      const time = gap <= 15 ? 1 : gap <= 60 ? 0.65 : a.start < b.end && b.start < a.end ? 0.4 : 0;
      if (!time) continue;
      const score = title * 0.44 + time * 0.18 + similarity(a.venueWords, b.venueWords) * 0.1 +
        nameOverlap(a.facilitators, b.facilitators) * 0.1 + nameOverlap(a.participants, b.participants) * 0.1 +
        nameOverlap(a.contacts, b.contacts) * 0.08;
      if (score >= 0.64 || (score >= 0.55 && title >= 0.78)) {
        const left = find(a.index), right = find(b.index);
        if (left !== right) parent[right] = left;
      }
    }
  }
  const groups = new Map();
  events.forEach((_, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  });
  return [...groups.values()];
}

export function findOverlaps(events) {
  const sorted = events.map((event, index) => ({ ...event, index }))
    .filter(event => !event.allDay).sort((a, b) => a.start - b.start);
  const pairs = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.start >= a.end) break;
      if (a.start >= b.end) continue;
      const sharedFac = a.facilitators.filter(name => b.facilitators.includes(name));
      const sharedPart = a.participants.filter(name => b.participants.includes(name));
      pairs.push({ a: a.index, b: b.index, start: Math.max(a.start, b.start), end: Math.min(a.end, b.end),
        sharedFac, sharedPart, basis: sharedFac.length ? "Shared facilitator" : sharedPart.length ? "Shared participant" : "Time overlap" });
    }
  }
  return pairs;
}

export function analyzeCalendar(type, events) {
  if (type === "duplicates") return groupDuplicates(events);
  if (type === "overlaps") return findOverlaps(events);
  throw new Error("Unknown calendar analysis task.");
}
