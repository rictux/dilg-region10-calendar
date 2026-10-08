export const CALENDAR_CACHE_TTL = 5 * 60 * 1000;
const MAX_ENTRIES = 30;
const MAX_BYTES = 20 * 1024 * 1024;
const DATABASE = "calendar-dashboard-cache";

export function validCalendarFeed(data) {
  const person = value => value && typeof value === "object" &&
    ["email", "displayName"].every(key => value[key] === undefined || typeof value[key] === "string");
  return !!data && typeof data.calendar?.id === "string" && Array.isArray(data.events) &&
    data.events.length <= 20000 && data.events.every(event => event && typeof event.id === "string" &&
      typeof event.calendarId === "string" && typeof event.summary === "string" &&
      (event.attendees === undefined || (Array.isArray(event.attendees) && event.attendees.every(person))) &&
      (event.organizer === undefined || person(event.organizer)) &&
      Number.isFinite(Date.parse(event.start?.dateTime || event.start?.date)) &&
      Number.isFinite(Date.parse(event.end?.dateTime || event.end?.date)));
}

export class CalendarCache {
  constructor() {
    this.memory = new Map();
    this.database = null;
  }
  key(url, range) { return JSON.stringify([url, range.from, range.to]); }
  fresh(record) {
    const age = Date.now() - record?.savedAt;
    return Number.isFinite(age) && age >= 0 && age < CALENDAR_CACHE_TTL &&
      Number.isFinite(record.bytes) && record.bytes > 0 && record.bytes <= MAX_BYTES;
  }
  async open() {
    if (!this.database) this.database = new Promise(resolve => {
      let finished = false;
      const finish = db => { if (!finished) { finished = true; clearTimeout(timer); resolve(db); } else db?.close(); };
      const timer = setTimeout(() => finish(null), 1000);
      try {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("feeds", { keyPath: "key" });
        request.onerror = request.onblocked = () => finish(null);
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); this.database = null; };
          finish(db);
        };
      } catch { finish(null); }
    });
    return this.database;
  }
  async transaction(mode, action) {
    const db = await this.open();
    if (!db) return null;
    return new Promise(resolve => {
      let transaction, result = null;
      const timer = setTimeout(() => { try { transaction?.abort(); } catch {} resolve(null); }, 1000);
      const finish = value => { clearTimeout(timer); resolve(value); };
      try {
        transaction = db.transaction("feeds", mode);
        transaction.oncomplete = () => finish(result);
        transaction.onerror = transaction.onabort = () => finish(null);
        action(transaction.objectStore("feeds"), value => { result = value; });
      } catch { finish(null); }
    });
  }
  remember(record) {
    this.memory.delete(record.key);
    this.memory.set(record.key, record);
    let bytes = [...this.memory.values()].reduce((sum, value) => sum + value.bytes, 0);
    for (const [key, value] of this.memory) {
      if (this.memory.size <= MAX_ENTRIES && bytes <= MAX_BYTES && this.fresh(value)) continue;
      this.memory.delete(key);
      bytes -= value.bytes;
    }
  }
  async get(url, range) {
    const key = this.key(url, range);
    let record = this.memory.get(key);
    if (!this.fresh(record)) record = await this.transaction("readonly", (store, done) => {
      const request = store.get(key);
      request.onsuccess = () => done(request.result);
    });
    if (!this.fresh(record) || !validCalendarFeed(record.data)) {
      this.memory.delete(key);
      return null;
    }
    this.remember(record);
    return { data: structuredClone(record.data), savedAt: record.savedAt };
  }
  async put(url, range, data, savedAt = Date.now()) {
    if (!validCalendarFeed(data)) return;
    const bytes = new Blob([JSON.stringify(data)]).size;
    if (bytes > MAX_BYTES) return;
    const record = { key: this.key(url, range), savedAt, bytes, data: structuredClone(data) };
    this.remember(record);
    await this.transaction("readwrite", store => {
      store.put(record);
      const request = store.getAll();
      request.onsuccess = () => {
        const rows = request.result.sort((a, b) => b.savedAt - a.savedAt);
        let count = 0, total = 0;
        for (const row of rows) {
          if (!this.fresh(row) || ++count > MAX_ENTRIES || (total += row.bytes) > MAX_BYTES) store.delete(row.key);
        }
      };
    });
  }
  async remove(url, range) {
    const key = this.key(url, range);
    this.memory.delete(key);
    await this.transaction("readwrite", store => store.delete(key));
  }
  async clear() {
    this.memory.clear();
    await this.transaction("readwrite", store => store.clear());
  }
}
