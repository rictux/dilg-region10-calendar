// Dates here use the application's Manila-shifted UTC calendar fields.
export function createCalendarView({ $, esc, fmtDate, localKey, startOfDay, eventDate,
  lastDay, eventRow, eventOfficeColors, deliveryMode, eventLevel, category, manilaNow }) {
  let selectedDate = null;
  let returnFocus = null;
  const drawer = $("calendarDrawer");
  $("calendarDrawerClose").onclick = () => drawer.close();
  drawer.addEventListener("click", event => {
    if (event.target !== drawer) return;
    const bounds = drawer.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) drawer.close();
  });
  drawer.addEventListener("close", () => {
    document.body.classList.remove("calendar-drawer-open");
    returnFocus?.focus();
  });

  function openDay(key, items, button) {
    selectedDate = key;
    returnFocus = button;
    $("calendarGrid").querySelectorAll("[data-calendar-date]").forEach(cell => {
      const selected = cell.dataset.calendarDate === key;
      cell.classList.toggle("selected", selected);
      cell.setAttribute("aria-pressed", String(selected));
    });
    const date = new Date(key + "T00:00:00Z");
    $("calendarDrawerTitle").textContent = fmtDate(date, {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    $("calendarDrawerCount").textContent = `${items.length} ${items.length === 1 ? "activity" : "activities"} under the current filters`;
    $("calendarDrawerEvents").innerHTML = items.length ? items.map(event => {
      const first = startOfDay(eventDate(event));
      const total = Math.round((lastDay(event) - first) / 864e5) + 1;
      return eventRow(event, { total, index: Math.round((date - first) / 864e5) + 1, ongoing: false });
    }).join("") : '<div class="empty"><strong>No activities scheduled</strong>This date has no activities under the current filters.</div>';
    drawer.showModal();
    document.body.classList.add("calendar-drawer-open");
    $("calendarDrawerClose").focus();
  }

  function tooltip(items, simultaneous) {
    const formats = new Map(), levels = new Map(), categories = new Map();
    for (const event of items) {
      const mode = deliveryMode(event), label = category(event);
      formats.set(mode, (formats.get(mode) || 0) + 1);
      const level = eventLevel(event);
      levels.set(level, (levels.get(level) || 0) + 1);
      categories.set(label, (categories.get(label) || 0) + 1);
    }
    const row = (label, value) => `<span class="calendar-tooltip-row"><span>${esc(label)}</span><span>${esc(String(value))}</span></span>`;
    const duplicates = items.filter(event => event.mergedCount).length;
    return `<strong>Daily summary</strong>${row("Activities", items.length)}${row("Offices involved", new Set(items.flatMap(event => event.offices)).size)}${row("Format", [...formats].map(([label, count]) => `${label} ${count}`).join(" · "))}${row("Event level", [...levels].map(([label, count]) => `${label} ${count}`).join(" · "))}${row("Categories", categories.size)}${duplicates ? row("Possible duplicates", duplicates) : ""}${simultaneous ? row("Simultaneous pairs", simultaneous) : ""}<span class="calendar-tooltip-categories"><strong>Key categories</strong>${[...categories].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, count]) => row(label, count)).join("")}</span>`;
  }

  function render(events, cursor, conflicts) {
    const year = cursor.getUTCFullYear(), month = cursor.getUTCMonth();
    const first = new Date(Date.UTC(year, month, 1)), last = new Date(Date.UTC(year, month + 1, 0));
    const offset = (first.getUTCDay() + 6) % 7;
    const total = Math.ceil((offset + last.getUTCDate()) / 7) * 7;
    // Object identity avoids collisions between offices that use the same event ID.
    const clipped = events.map(event => ({ event,
      start: new Date(Math.max(startOfDay(eventDate(event)), first)),
      end: new Date(Math.min(lastDay(event), last)),
    })).filter(item => item.start <= item.end);
    const days = new Map(), weeks = [], simultaneous = new Map();
    for (const pair of conflicts) {
      const start = new Date(Math.max(startOfDay(pair.start), first));
      const end = new Date(Math.min(startOfDay(new Date(+pair.end - 1)), last));
      for (let date = start; date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
        const key = localKey(date);
        simultaneous.set(key, (simultaneous.get(key) || 0) + 1);
      }
    }
    for (const item of clipped) {
      for (let date = new Date(item.start); date <= item.end; date.setUTCDate(date.getUTCDate() + 1)) {
        const key = localKey(date);
        if (!days.has(key)) days.set(key, []);
        days.get(key).push(item.event);
      }
    }
    for (let week = 0; week < total / 7; week++) {
      const start = new Date(Date.UTC(year, month, 1 - offset + week * 7));
      const end = new Date(+start + 6 * 864e5);
      const lanes = [];
      weeks.push(clipped.filter(item => item.start <= end && item.end >= start)
        .map(item => ({ event: item.event, start: new Date(Math.max(item.start, start)), end: new Date(Math.min(item.end, end)) }))
        .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.event.summary.localeCompare(b.event.summary))
        .map(segment => {
          let lane = lanes.findIndex(end => end < segment.start);
          if (lane < 0) lane = lanes.length;
          lanes[lane] = segment.end;
          return { ...segment, lane };
        }));
    }
    const today = localKey(manilaNow());
    $("calendarMonthCount").textContent = `${events.length} ${events.length === 1 ? "activity" : "activities"}`;
    $("calendarGrid").innerHTML = Array.from({ length: total }, (_, index) => {
      const day = index - offset + 1;
      if (day < 1 || day > last.getUTCDate()) return '<div class="calendar-day outside" aria-hidden="true"></div>';
      const date = new Date(Date.UTC(year, month, day)), key = localKey(date), items = days.get(key) || [];
      const segments = weeks[Math.floor(index / 7)].filter(segment => segment.start <= date && segment.end >= date);
      const visible = segments.filter(segment => segment.lane < 3);
      const previews = visible.map(segment => {
        const event = segment.event, color = eventOfficeColors(event)[0];
        const multi = startOfDay(eventDate(event)) < lastDay(event);
        const isStart = localKey(segment.start) === key, isEnd = localKey(segment.end) === key;
        const classes = `calendar-event-preview ${multi ? "multi-day" : "single-day"} ${isStart ? "segment-start" : "segment-middle"} ${isEnd ? "segment-end" : ""}`;
        return `<span class="${classes}" style="--event-color:${esc(color)};grid-row:${segment.lane + 1}" title="${esc(event.summary)}"><i></i><span>${isStart ? esc(event.summary || "(No title)") : ""}</span></span>`;
      }).join("");
      const hidden = segments.length - visible.length;
      return `<button type="button" class="calendar-day${selectedDate === key ? " selected" : ""}${today === key ? " today" : ""}" data-calendar-date="${key}" aria-pressed="${selectedDate === key}" aria-label="${esc(fmtDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }))}: ${items.length} ${items.length === 1 ? "activity" : "activities"}"><span class="calendar-number">${day}</span><span class="calendar-event-stack">${previews}</span>${hidden ? `<span class="calendar-more">+${hidden} more</span>` : ""}<span class="calendar-tooltip" aria-hidden="true">${tooltip(items, simultaneous.get(key))}</span></button>`;
    }).join("");
    $("calendarGrid").querySelectorAll("[data-calendar-date]").forEach(button => {
      button.onclick = () => openDay(button.dataset.calendarDate, days.get(button.dataset.calendarDate) || [], button);
    });
  }

  return { render, close: () => { if (drawer.open) drawer.close(); } };
}
