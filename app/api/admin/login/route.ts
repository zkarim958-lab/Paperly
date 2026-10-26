import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminConfigured, clearThrottle, makeToken, passwordOk, sameOrigin, throttled } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!adminConfigured()) return NextResponse.json({ error: "Admin is not set up. Add ADMIN_PASSWORD (8+ characters) to your environment." }, { status: 503 });
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (throttled(ip)) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  let password = "";
  try {
    password = String(((await req.json()) as { password?: unknown }).password ?? "");
  } catch {
    /* empty body */
  }
  await new Promise((r) => setTimeout(r, 400));
  if (!passwordOk(password)) return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  clearThrottle(ip);
  const t = makeToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, t.value, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: t.maxAge });
  return res;
}
