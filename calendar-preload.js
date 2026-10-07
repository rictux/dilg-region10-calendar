import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { fetchCalendarLinks } from "./calendar-links.js";
import { fetchCalendar } from "./calendar.js";

const serverKey = () => process.env.supabase_secret_key || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const encryptionKey = secret => {
  if (!secret) throw new Error("Preload is not configured");
  return createHash("sha256").update("calendar-preload-v1:").update(secret).digest();
};

export function createCalendarPreloader({ readLinks = fetchCalendarLinks, readFeed = fetchCalendar, getSecret = serverKey, now = Date.now } = {}) {
  let pending;
  let cached;
  let expires = 0;
  return {
    async prepare() {
      if (cached && expires > now()) return cached;
      if (pending) return pending;
      pending = (async () => {
        const key = encryptionKey(getSecret());
        const year = new Date(now() + 8 * 3600000).getUTCFullYear();
        const from = `${year}-01-01T00:00:00+08:00`;
        const to = `${year + 1}-01-01T00:00:00+08:00`;
        const calendars = await readLinks();
        const results = await Promise.allSettled(calendars.map(row => readFeed(row.link, new Date(from), new Date(to))));
        const feeds = results.map((result, i) => result.status === "fulfilled"
          ? { link: calendars[i].link, data: result.value }
          : { link: calendars[i].link, error: "Calendar could not be loaded. Reload to retry." });
        const plaintext = Buffer.from(JSON.stringify({ calendars, feeds, from, to, expires: now() + 5 * 60000 }));
        // Stay below Vercel's request/response size limit after base64 encoding.
        if (plaintext.length > 2500000) throw new Error("Preload too large");
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        cached = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
        expires = now() + 60000;
        return cached;
      })();
      try { return await pending; } finally { pending = null; }
    },
    open(sealed) {
      if (typeof sealed !== "string" || sealed.length > 3400000) throw new Error("Invalid preload");
      const bytes = Buffer.from(sealed, "base64url");
      if (bytes.length < 29) throw new Error("Invalid preload");
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey(getSecret()), bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
      if (!Number.isFinite(data.expires) || data.expires <= now()) throw new Error("Expired preload");
      return data;
    },
  };
}
