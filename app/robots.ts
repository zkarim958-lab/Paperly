import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

/** /robots.txt: everything is crawlable except the admin area; the sitemap is advertised. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { siteUrl } = await getSettings();
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }], sitemap: absoluteUrl("/sitemap.xml", siteUrl) };
}
