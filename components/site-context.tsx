"use client";

import { createContext, useContext, type ReactNode } from "react";
import { EMPTY_ADSTERRA, type PublicSite } from "@/lib/site";

/*
 * Site settings for client components (name, logo, ad IDs...). The root layout
 * reads them on the server (they come from the admin panel) and provides them.
 */

export const DEFAULT_SITE: PublicSite = {
  siteName: "PageForge",
  tagline: "Free, private PDF tools that run in your browser. Your files never leave your device.",
  logoUrl: null,
  contactEmail: "",
  adsenseClient: "",
  adSlots: { leaderboard: "", skyLeft: "", skyRight: "", processing: "", result: "", footer: "", belowTools: "" },
  useGoogleCmp: false,
  adsterra: EMPTY_ADSTERRA,
};

const Ctx = createContext<PublicSite>(DEFAULT_SITE);

// Plain (non-hook) code such as openCookieSettings() reads the last provided value from here.
let current: PublicSite = DEFAULT_SITE;
export const getSiteNow = () => current;

export function SiteProvider({ value, children }: { value: PublicSite; children: ReactNode }) {
  current = value;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSite = () => useContext(Ctx);
