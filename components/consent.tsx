"use client";

/*
 * CONSENT + ADSENSE LOADING (client only).
 *
 * Goal: no advertising cookie is set until it is allowed where the visitor is.
 *
 *  - The AdSense script is NOT in the HTML. <AdSenseLoader /> adds it only when
 *    the current mode allows ads.
 *  - Visitors whose browser time zone is in Europe (EEA, UK, Switzerland) are
 *    treated as a strict region: ads load only after "Accept all". Choosing
 *    "Reject non-essential" means no ads and no ad cookies at all.
 *  - Everywhere else, ads load as non-personalised until the visitor accepts
 *    personalised ads. A browser Global Privacy Control signal is honoured:
 *    personalised ads stay off even after "Accept all".
 *  - A time zone is only a heuristic. For full legal cover in the UK/EEA, turn
 *    on Google's own certified consent message (AdSense > Privacy & messaging)
 *    and set NEXT_PUBLIC_USE_GOOGLE_CMP=true. This built-in banner is then
 *    hidden and Google's message takes over.
 */

import { useEffect, useState } from "react";
import { getSiteNow, useSite } from "@/components/site-context";

export const CONSENT_KEY = "pf_consent_v1";
export const CONSENT_EVENT = "pf-consent-changed";

export type Consent = "all" | "necessary" | null;
/** off: load nothing. npa: non-personalised ads. personalized: normal ads. cmp: Google's CMP decides. */
export type AdsMode = "off" | "npa" | "personalized" | "cmp";

export function readConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "all" || v === "necessary" ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(value: "all" | "necessary") {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* private mode: the choice just lasts for this page view */
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** True for visitors who are probably in the EEA, UK or Switzerland (browser time zone). */
export function isStrictRegion(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    return /^(Europe|Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe))\//.test(tz) && !/^Europe\/(Moscow|Minsk|Kaliningrad|Kirov|Samara|Volgograd|Saratov|Ulyanovsk|Astrakhan|Simferopol|Istanbul|Kyiv|Kiev|Chisinau)$/.test(tz);
  } catch {
    return true; // unknown location: take the cautious path
  }
}

function gpcOn(): boolean {
  return (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function computeAdsMode(): AdsMode {
  if (getSiteNow().useGoogleCmp) return "cmp";
  const c = readConsent();
  if (isStrictRegion()) return c === "all" ? "personalized" : "off";
  if (c === "all" && !gpcOn()) return "personalized";
  return "npa";
}

/** Current ad mode; updates when the visitor changes their choice. Starts "off" on the server. */
export function useAdsMode(): AdsMode {
  const { useGoogleCmp } = useSite();
  const [mode, setMode] = useState<AdsMode>("off");
  useEffect(() => {
    const update = () => setMode(computeAdsMode());
    update();
    window.addEventListener(CONSENT_EVENT, update);
    return () => window.removeEventListener(CONSENT_EVENT, update);
  }, [useGoogleCmp]);
  return mode;
}

type AdsArray = unknown[] & { requestNonPersonalizedAds?: number };

/** Adds Google's script once ads are allowed. Replaces a static <script> in the layout. */
export function AdSenseLoader() {
  const mode = useAdsMode();
  const { adsenseClient: ADSENSE_CLIENT, useGoogleCmp: USE_GOOGLE_CMP } = useSite();

  useEffect(() => {
    if (!ADSENSE_CLIENT || mode === "off") return;
    const w = window as unknown as { adsbygoogle?: AdsArray };
    w.adsbygoogle = (w.adsbygoogle ?? []) as AdsArray;
    if (mode === "npa") w.adsbygoogle.requestNonPersonalizedAds = 1;
    if (mode === "personalized") w.adsbygoogle.requestNonPersonalizedAds = 0;
    if (document.getElementById("adsense-loader")) return;
    // Wait until the browser is idle so ads never delay the first paint.
    const add = () => {
      const s = document.createElement("script");
      s.id = "adsense-loader";
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
      document.head.appendChild(s);
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(add);
    else setTimeout(add, 1200);
  }, [mode, ADSENSE_CLIENT]);

  // If the visitor withdraws consent after ads already loaded, reload so the ad script and its cookies are gone.
  useEffect(() => {
    if (USE_GOOGLE_CMP) return;
    const onChange = () => {
      const loaded = Boolean(document.getElementById("adsense-loader"));
      const next = computeAdsMode();
      if (loaded && (next === "off" || next === "npa")) window.location.reload();
    };
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, [USE_GOOGLE_CMP]);

  return null;
}

/** Footer "Cookie settings": reopens our banner, or Google's message when it is in use. */
export function openCookieSettings() {
  if (getSiteNow().useGoogleCmp) {
    try {
      const g = window as unknown as { googlefc?: { callbackQueue?: unknown[]; showRevocationMessage?: () => void } };
      g.googlefc = g.googlefc ?? {};
      g.googlefc.callbackQueue = g.googlefc.callbackQueue ?? [];
      g.googlefc.callbackQueue.push({ CONSENT_DATA_READY: () => g.googlefc?.showRevocationMessage?.() });
    } catch {
      /* ignore */
    }
    return;
  }
  window.dispatchEvent(new Event("open-cookie-settings"));
}
