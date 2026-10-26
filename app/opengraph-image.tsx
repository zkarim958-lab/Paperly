import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/settings";

/* Default social-share card (1200x630) generated at build time. */
export const alt = "Free private PDF tools that run in your browser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const name = (await getSettings()).siteName;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#fafafa", color: "#18181b" }}>
        <div style={{ fontSize: 40, fontWeight: 700, display: "flex" }}>{name}</div>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.1, marginTop: 24, display: "flex" }}>Free PDF tools that run in your browser</div>
        <div style={{ fontSize: 34, color: "#52525b", marginTop: 28, display: "flex" }}>Edit, merge, compress, split and convert. Nothing is uploaded.</div>
      </div>
    ),
    size,
  );
}
