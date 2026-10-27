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

/* ------------------------------------------------------------- Adsterra */

export type AdsterraSite = {
  /** Per placement: "key|width|height|https://host/path.js" (empty = not used). */
  banners: Record<AdSlotKey, string>;
  /** https URL of the Social Bar script (empty = off). */
  socialBar: string;
  /** https URL of the Popunder script (empty = off). */
  popunder: string;
};

export const EMPTY_ADSTERRA: AdsterraSite = {
  banners: { leaderboard: "", skyLeft: "", skyRight: "", processing: "", result: "", footer: "", belowTools: "" },
  socialBar: "",
  popunder: "",
};

const SCRIPT_URL = /^(?:https?:)?\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/[\w\-./]+)(?:\?[\w=&%.-]*)?$/i;
/** "//host/x.js" or "https://host/x.js?y" -> "https://host/x.js", or null if it is not a plain script URL. */
export function normScriptUrl(raw: string): string | null {
  const m = SCRIPT_URL.exec(raw.trim());
  return m ? `https://${m[1].toLowerCase()}${m[2]}` : null;
}

/** Pulls the script URL out of pasted Adsterra code (or accepts the bare URL). */
export function parseAdsterraScript(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "";
  const m = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(t);
  return normScriptUrl(m ? m[1] : t);
}

const CANON = /^([a-f0-9]{32})\|(\d{2,4})\|(\d{2,4})\|(https:\/\/[a-z0-9.-]+\/[\w\-./]+)$/;
/** Accepts the pasted Banner code or our stored form; returns the stored form, "" for empty, null if unreadable. */
export function parseAdsterraBanner(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "";
  if (CANON.test(t)) return t;
  const key = /["']key["']\s*:\s*["']([a-f0-9]{32})["']/i.exec(t)?.[1]?.toLowerCase();
  const w = /["']width["']\s*:\s*(\d{2,4})/i.exec(t)?.[1];
  const h = /["']height["']\s*:\s*(\d{2,4})/i.exec(t)?.[1];
  const srcRaw = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(t)?.[1];
  const src = srcRaw ? normScriptUrl(srcRaw) : null;
  if (!key || !w || !h || !src) return null;
  if (+w > 1000 || +h > 1000) return null;
  return `${key}|${w}|${h}|${src}`;
}

export function splitBanner(v: string): { key: string; w: number; h: number; src: string } | null {
  const m = CANON.exec(v);
  return m ? { key: m[1], w: +m[2], h: +m[3], src: m[4] } : null;
}

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
  adsterra: AdsterraSite;
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
