import { readFresh } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Serves the logo uploaded in the admin panel. */
export async function GET() {
  const { logo, logoVersion } = await readFresh();
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(logo);
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: {
      "Content-Type": m[1],
      "Cache-Control": "public, max-age=0, must-revalidate",
      ETag: `"logo-${logoVersion}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
