/*
 * ADMIN LOGIN (server only). One password from the ADMIN_PASSWORD environment
 * variable. A successful login sets a signed, httpOnly cookie that lasts a week.
 * Changing ADMIN_PASSWORD (or ADMIN_SECRET) logs everyone out.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "pf_admin";
const WEEK = 7 * 24 * 60 * 60;

export const adminConfigured = () => (process.env.ADMIN_PASSWORD ?? "").length >= 8;

const secret = () => process.env.ADMIN_SECRET || `pf-admin:${process.env.ADMIN_PASSWORD ?? ""}`;
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("hex");
const sha = (s: string) => createHash("sha256").update(s).digest();

export function passwordOk(candidate: string): boolean {
  if (!adminConfigured()) return false;
  return timingSafeEqual(sha(candidate), sha(process.env.ADMIN_PASSWORD ?? ""));
}

export function makeToken(): { value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + WEEK;
  return { value: `${exp}.${sign(String(exp))}`, maxAge: WEEK };
}

function tokenOk(token: string | undefined): boolean {
  if (!token || !adminConfigured()) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || Number(exp) < Date.now() / 1000) return false;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  return tokenOk((await cookies()).get(ADMIN_COOKIE)?.value);
}

/** Rejects cross-site requests (the cookie is SameSite=Strict too). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

/* Best-effort brute-force throttle (per server instance). */
const attempts = new Map<string, { n: number; t: number }>();
export function throttled(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.t > 15 * 60_000) {
    attempts.set(ip, { n: 1, t: now });
    return false;
  }
  a.n++;
  return a.n > 8;
}
export function clearThrottle(ip: string) {
  attempts.delete(ip);
}
