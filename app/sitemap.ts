import type { MetadataRoute } from "next";
import { LANDINGS, absoluteUrl, landingPath } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

/** /sitemap.xml: home, every landing page and the policy pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { siteUrl } = await getSettings();
  const now = new Date();
  return [
    { url: absoluteUrl("/", siteUrl), lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...LANDINGS.map((l) => ({ url: absoluteUrl(landingPath(l.slug), siteUrl), lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...["/about", "/privacy", "/terms", "/contact"].map((p) => ({ url: absoluteUrl(p, siteUrl), lastModified: now, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
