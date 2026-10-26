/*
 * Shared (server + client) site-settings types and helpers. No secrets here.
 */

export const AD_SLOT_KEYS = ["leaderboard", "skyLeft", "skyRight", "processing", "result", "footer", "belowTools"] as const;
export type AdSlotKey = (typeof AD_SLOT_KEYS)[number];

export const AD_SLOT_LABELS: Record<AdSlotKey, string> = {
  leaderboard: "Top leaderboard (728x90)",
  skyLeft: "Left skyscraper (160x600)",
  skyRight: "Right skyscraper (160x600)",
  processing: "While processing (300x250)",
  result: "After result (300x250)",
  footer: "Footer banner (970x90)",
  belowTools: "Below the tools (responsive)",
};

/** What the browser is allowed to know. */
export type PublicSite = {
  siteName: string;
  tagline: string;
  /** URL of the uploaded logo, or null for the default icon. */
  logoUrl: string | null;
  contactEmail: string;
  adsenseClient: string;
  adSlots: Record<AdSlotKey, string>;
  useGoogleCmp: boolean;
};

/** Placeholder used inside static SEO copy; replaced with the configured site name. */
export const BRAND = "{site}";

/** Deep-replaces {site} in every string of a value (objects and arrays included). */
export function applySite<T>(value: T, name: string): T {
  if (typeof value === "string") return value.split(BRAND).join(name) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => applySite(v, name)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = applySite(v, name);
    return out as T;
  }
  return value;
}
