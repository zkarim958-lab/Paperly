/*
 * SITE SETTINGS (server only): what the admin panel edits.
 *
 * Defaults come from the NEXT_PUBLIC_* environment variables, so an existing
 * .env.local keeps working. Anything saved in the admin panel overrides them.
 *
 * Storage (first one that is configured wins):
 *  - Supabase (free tier) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 *    One table, see README. The key is server-only; never expose it to the browser.
 *  - Upstash Redis / Vercel KV (REST) when UPSTASH_REDIS_REST_URL + _TOKEN
 *    (or KV_REST_API_URL + _TOKEN) are set. Use this on Vercel and other
 *    serverless hosts, whose file system is read-only.
 *  - A JSON file (.data/settings.json, or SETTINGS_FILE) otherwise. Fine for a
 *    VPS or any host with a persistent disk.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { AD_SLOT_KEYS, type AdSlotKey, type PublicSite } from "@/lib/site";

export type Settings = {
  siteName: string;
  tagline: string;
  siteUrl: string;
  homeTitle: string;
  homeDescription: string;
  googleSiteVerification: string;
  contactEmail: string;
  operatorName: string;
  operatorAddress: string;
  operatorCountry: string;
  adsenseClient: string;
  adSlots: Record<AdSlotKey, string>;
  useGoogleCmp: boolean;
};

type Stored = Partial<Settings> & { logo?: string; logoVersion?: number };

const env = (k: string) => (process.env[k] ?? "").trim();

export function defaultSettings(): Settings {
  const name = env("NEXT_PUBLIC_SITE_NAME") || "PageForge";
  return {
    siteName: name,
    tagline: "Free, private PDF tools that run in your browser. Your files never leave your device.",
    siteUrl: (env("NEXT_PUBLIC_SITE_URL") || "https://example.com").replace(/\/$/, ""),
    homeTitle: `Free PDF Editor & Tools Online: Edit, Merge, Compress, Convert | ${name}`,
    homeDescription:
      "Free, private PDF tools that run in your browser. Edit PDF text (including scans), merge, compress, split, rotate, convert PDF to Word, Excel, PowerPoint and JPG, Word and Excel to PDF, and add or remove passwords. No uploads, no sign-up.",
    googleSiteVerification: env("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION"),
    contactEmail: env("NEXT_PUBLIC_CONTACT_EMAIL") || "contact@example.com",
    operatorName: env("NEXT_PUBLIC_OPERATOR_NAME"),
    operatorAddress: env("NEXT_PUBLIC_OPERATOR_ADDRESS"),
    operatorCountry: env("NEXT_PUBLIC_OPERATOR_COUNTRY"),
    adsenseClient: env("NEXT_PUBLIC_ADSENSE_CLIENT"),
    adSlots: {
      leaderboard: env("NEXT_PUBLIC_AD_SLOT_LEADERBOARD"),
      skyLeft: env("NEXT_PUBLIC_AD_SLOT_SKY_LEFT"),
      skyRight: env("NEXT_PUBLIC_AD_SLOT_SKY_RIGHT"),
      processing: env("NEXT_PUBLIC_AD_SLOT_PROCESSING"),
      result: env("NEXT_PUBLIC_AD_SLOT_RESULT"),
      footer: env("NEXT_PUBLIC_AD_SLOT_FOOTER"),
      belowTools: env("NEXT_PUBLIC_AD_SLOT_BELOW_TOOLS"),
    },
    useGoogleCmp: env("NEXT_PUBLIC_USE_GOOGLE_CMP") === "true",
  };
}

/* ----------------------------------------------------------------- storage */

const KEY = "pageforge:settings";
const REST_URL = () => env("UPSTASH_REDIS_REST_URL") || env("KV_REST_API_URL");
const REST_TOKEN = () => env("UPSTASH_REDIS_REST_TOKEN") || env("KV_REST_API_TOKEN");
const FILE = () => env("SETTINGS_FILE") || path.join(process.cwd(), ".data", "settings.json");

const SB_URL = () => env("SUPABASE_URL").replace(/\/$/, "");
const SB_KEY = () => env("SUPABASE_SERVICE_ROLE_KEY");
const sbHeaders = () => ({ apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}`, "Content-Type": "application/json" });

export function storageKind(): "supabase" | "redis" | "file" {
  if (SB_URL() && SB_KEY()) return "supabase";
  return REST_URL() && REST_TOKEN() ? "redis" : "file";
}

async function readStored(): Promise<Stored> {
  try {
    if (storageKind() === "supabase") {
      const r = await fetch(`${SB_URL()}/rest/v1/site_settings?key=eq.main&select=value`, { headers: sbHeaders(), cache: "no-store" });
      if (!r.ok) return {};
      const rows = (await r.json()) as { value?: Stored }[];
      return rows[0]?.value ?? {};
    }
    if (storageKind() === "redis") {
      const r = await fetch(`${REST_URL()}/get/${encodeURIComponent(KEY)}`, { headers: { Authorization: `Bearer ${REST_TOKEN()}` }, cache: "no-store" });
      if (!r.ok) return {};
      const j = (await r.json()) as { result?: string | null };
      return j.result ? (JSON.parse(j.result) as Stored) : {};
    }
    return JSON.parse(await fs.readFile(FILE(), "utf8")) as Stored;
  } catch {
    return {};
  }
}

async function writeStored(data: Stored): Promise<void> {
  const body = JSON.stringify(data);
  if (storageKind() === "supabase") {
    const r = await fetch(`${SB_URL()}/rest/v1/site_settings?on_conflict=key`, {
      method: "POST",
      headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ key: "main", value: data }]),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`Could not save to Supabase (${r.status}). Did you create the site_settings table? See the README.`);
    return;
  }
  if (storageKind() === "redis") {
    const r = await fetch(`${REST_URL()}/set/${encodeURIComponent(KEY)}`, { method: "POST", headers: { Authorization: `Bearer ${REST_TOKEN()}` }, body, cache: "no-store" });
    if (!r.ok) throw new Error(`Could not save to Redis (${r.status}).`);
    return;
  }
  const file = FILE();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body, "utf8");
  } catch {
    throw new Error(
      "This server's disk is read-only, so settings can't be saved to a file. Add a free Upstash Redis database and set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (see README).",
    );
  }
}

/* ------------------------------------------------------------------- reads */

function merge(stored: Stored): Settings {
  const d = defaultSettings();
  const out: Settings = { ...d, adSlots: { ...d.adSlots } };
  for (const k of Object.keys(d) as (keyof Settings)[]) {
    if (k === "adSlots") continue;
    const v = stored[k];
    if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  }
  if (stored.adSlots) for (const k of AD_SLOT_KEYS) if (typeof stored.adSlots[k] === "string") out.adSlots[k] = stored.adSlots[k];
  return out;
}

const cachedSettings = unstable_cache(
  async () => {
    const s = await readStored();
    return { settings: merge(s), hasLogo: Boolean(s.logo), logoVersion: s.logoVersion ?? 0 };
  },
  ["site-settings-v1"],
  { tags: ["site-settings"], revalidate: 60 },
);

/** Cached read for pages and layouts. */
export async function getSettings(): Promise<Settings> {
  return (await cachedSettings()).settings;
}

export async function getLogoInfo(): Promise<{ hasLogo: boolean; logoVersion: number }> {
  const r = await cachedSettings();
  return { hasLogo: r.hasLogo, logoVersion: r.logoVersion };
}

export async function getPublicSite(): Promise<PublicSite> {
  const { settings: s, hasLogo, logoVersion } = await cachedSettings();
  return {
    siteName: s.siteName,
    tagline: s.tagline,
    logoUrl: hasLogo ? `/api/logo?v=${logoVersion}` : null,
    contactEmail: s.contactEmail,
    adsenseClient: s.adsenseClient,
    adSlots: s.adSlots,
    useGoogleCmp: s.useGoogleCmp,
  };
}

/** Uncached, for the admin screen and the logo route. */
export async function readFresh(): Promise<{ settings: Settings; logo: string; logoVersion: number }> {
  const s = await readStored();
  return { settings: merge(s), logo: s.logo ?? "", logoVersion: s.logoVersion ?? 0 };
}

/* ------------------------------------------------------------- validation */

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export class ValidationError extends Error {}

export function validate(input: Record<string, unknown>): { patch: Partial<Settings>; logo?: string | null } {
  const patch: Partial<Settings> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(input, k);

  if (has("siteName")) {
    const v = str(input.siteName, 60);
    if (!v) throw new ValidationError("Site name can't be empty.");
    if (/[<>{}]/.test(v)) throw new ValidationError("Site name can't contain < > { or }.");
    patch.siteName = v;
  }
  if (has("tagline")) patch.tagline = str(input.tagline, 200);
  if (has("siteUrl")) {
    const v = str(input.siteUrl, 200).replace(/\/+$/, "");
    try {
      const u = new URL(v);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
      patch.siteUrl = u.origin;
    } catch {
      throw new ValidationError("Site URL must look like https://your-domain.com");
    }
  }
  if (has("homeTitle")) patch.homeTitle = str(input.homeTitle, 120);
  if (has("homeDescription")) patch.homeDescription = str(input.homeDescription, 320);
  if (has("googleSiteVerification")) {
    const v = str(input.googleSiteVerification, 120);
    if (v && !/^[\w-]+$/.test(v)) throw new ValidationError("The Google verification code should be only the code (letters, numbers, - and _), not the whole meta tag.");
    patch.googleSiteVerification = v;
  }
  if (has("contactEmail")) {
    const v = str(input.contactEmail, 120);
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)) throw new ValidationError("Enter a valid contact email.");
    patch.contactEmail = v;
  }
  if (has("operatorName")) patch.operatorName = str(input.operatorName, 120);
  if (has("operatorAddress")) patch.operatorAddress = str(input.operatorAddress, 240);
  if (has("operatorCountry")) patch.operatorCountry = str(input.operatorCountry, 80);
  if (has("adsenseClient")) {
    const v = str(input.adsenseClient, 40);
    if (v && !/^ca-pub-\d{8,20}$/.test(v)) throw new ValidationError("AdSense publisher ID looks like ca-pub-1234567890123456.");
    patch.adsenseClient = v;
  }
  if (has("useGoogleCmp")) patch.useGoogleCmp = input.useGoogleCmp === true;
  if (has("adSlots") && input.adSlots && typeof input.adSlots === "object") {
    const slots = {} as Record<AdSlotKey, string>;
    for (const k of AD_SLOT_KEYS) {
      const v = str((input.adSlots as Record<string, unknown>)[k], 20);
      if (v && !/^\d{6,15}$/.test(v)) throw new ValidationError(`Ad slot IDs are numbers only (check "${k}").`);
      slots[k] = v;
    }
    patch.adSlots = slots;
  }

  let logo: string | null | undefined;
  if (has("logo")) {
    if (input.logo === null || input.logo === "") logo = null;
    else if (typeof input.logo === "string") {
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.logo)) throw new ValidationError("The logo must be a PNG, JPG or WebP image.");
      if (input.logo.length > 400_000) throw new ValidationError("The logo is too large. Use an image under about 250 KB.");
      logo = input.logo;
    }
  }
  return { patch, logo };
}

export async function saveSettings(input: Record<string, unknown>): Promise<void> {
  const { patch, logo } = validate(input);
  const current = await readStored();
  const next: Stored = { ...current, ...patch };
  if (patch.adSlots) next.adSlots = patch.adSlots;
  if (logo === null) {
    delete next.logo;
    next.logoVersion = Date.now();
  } else if (typeof logo === "string") {
    next.logo = logo;
    next.logoVersion = Date.now();
  }
  await writeStored(next);
  // On-demand refresh where supported. Everywhere else (and on Cloudflare) the
  // 60-second background refresh picks the change up, so a failure here is fine.
  try {
    revalidateTag("site-settings");
    revalidatePath("/", "layout");
  } catch {
    /* time-based refresh covers it */
  }
}
