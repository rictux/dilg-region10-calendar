import { createHmac, timingSafeEqual } from "node:crypto";

const key = () => process.env.supabase_secret_key || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const sign = (value, secret) => createHmac("sha256", secret).update("calendar-access:").update(value).digest("base64url");
const equal = (a, b) => {
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
};

export async function supabaseServerRequest(path, options = {}) {
  const secret = key();
  const origin = process.env.supabase_url || process.env.SUPABASE_URL;
  if (!secret || !origin) throw new Error("Access verification is not configured.");
  const base = new URL(origin);
  if (base.username || base.password || base.pathname !== "/" || base.search || base.hash ||
    (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)))) {
    throw new Error("Invalid Supabase API origin.");
  }
  const url = new URL(`/rest/v1/${path}`, base);
  const headers = { ...options.headers, apikey: secret, "Accept-Profile": "system_calendar", "Content-Profile": "system_calendar" };
  if (!secret.startsWith("sb_secret_")) headers.Authorization = `Bearer ${secret}`;
  return fetch(url, { ...options, headers, redirect: "error", signal: AbortSignal.timeout(10000) });
}

export async function readAccessCode(usedFor = "access") {
  if (!["access", "add"].includes(usedFor)) throw new Error("Invalid code purpose.");
  const query = new URLSearchParams({ select: "id,code", used_for: `eq.${usedFor}`, order: "created_at.desc,id.desc", limit: "1" });
  const response = await supabaseServerRequest(`auth_code?${query}`);
  if (!response.ok) throw new Error("Access code lookup failed.");
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0].code !== "string" || !rows[0].code) {
    throw new Error("No current access code is configured.");
  }
  return rows[0];
}

export async function verifyAddCode(code) {
  const row = await readAccessCode("add");
  return equal(sign(code, key()), sign(row.code, key()));
}

// Tokens live only in page memory. Reloading the page requires entering the code again.
export function createAccessControl({ readCode = readAccessCode, getSecret = key, now = Date.now } = {}) {
  const attempts = new Map();
  const revision = (row, secret) => sign(JSON.stringify([row.id, row.code]), secret);
  return {
    async login(req, res) {
      res.set("Cache-Control", "no-store");
      if (req.get("sec-fetch-site") === "cross-site") return res.status(403).json({ error: "Request not allowed." });
      const code = req.body?.code;
      if (typeof code !== "string" || !code || code.length > 1024) return res.status(400).json({ error: "Enter the current Auth Code." });
      const stamp = now();
      for (const [ip, item] of attempts) if (item.until <= stamp) attempts.delete(ip);
      const ip = req.ip || "unknown";
      const item = attempts.get(ip) || { count: 0, until: stamp + 60000 };
      if (item.count >= 10 || (!attempts.has(ip) && attempts.size >= 5000)) {
        return res.set("Retry-After", "60").status(429).json({ error: "Too many attempts. Wait one minute and try again." });
      }
      item.count++;
      attempts.set(ip, item);
      try {
        const secret = getSecret();
        if (!secret) throw new Error("Missing server key");
        const row = await readCode();
        if (!equal(sign(code, secret), sign(row.code, secret))) return res.status(401).json({ error: "Incorrect Auth Code. Please try again." });
        attempts.delete(ip);
        const payload = Buffer.from(JSON.stringify({ exp: stamp + 8 * 3600000, rev: revision(row, secret) })).toString("base64url");
        res.json({ token: `${payload}.${sign(payload, secret)}` });
      } catch {
        res.status(503).json({ error: "Unable to verify the Auth Code right now. Please try again later." });
      }
    },
    async require(req, res, next) {
      res.set("Cache-Control", "no-store");
      const token = req.get("authorization")?.replace(/^Bearer /, "") || "";
      if (!token || token.length > 2048) return res.status(401).json({ error: "Enter the current Auth Code to continue." });
      const secret = getSecret();
      if (!secret) return res.status(503).json({ error: "Access verification is unavailable." });
      const [payload, signature, extra] = token.split(".");
      let claims;
      try {
        if (extra || !signature || !equal(sign(payload, secret), signature)) throw new Error();
        claims = JSON.parse(Buffer.from(payload, "base64url").toString());
        if (!Number.isFinite(claims.exp) || claims.exp <= now() || typeof claims.rev !== "string") throw new Error();
      } catch {
        return res.status(401).json({ error: "Enter the current Auth Code to continue." });
      }
      try {
        if (!equal(claims.rev, revision(await readCode(), secret))) return res.status(401).json({ error: "The Auth Code has changed. Please enter the current code." });
      } catch {
        return res.status(503).json({ error: "Access verification is unavailable." });
      }
      next();
    },
  };
}
