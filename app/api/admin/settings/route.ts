import { NextResponse } from "next/server";
import { isAdmin, sameOrigin } from "@/lib/admin-auth";
import { ValidationError, defaultSettings, readFresh, saveSettings, storageKind } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { settings, logo } = await readFresh();
  return NextResponse.json({ settings, hasLogo: Boolean(logo), logo, defaults: defaultSettings(), storage: storageKind() });
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const body = (await req.json()) as Record<string, unknown>;
    await saveSettings(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof ValidationError ? 400 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save." }, { status });
  }
}
