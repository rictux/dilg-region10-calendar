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
