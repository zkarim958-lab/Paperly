"use client";

import { openCookieSettings } from "@/components/consent";

/** Inline "Cookie settings" link usable inside server-rendered policy pages. */
export function CookieSettingsLink() {
  return (
    <button type="button" onClick={openCookieSettings} className="font-medium text-zinc-900 underline dark:text-zinc-300">
      Cookie settings
    </button>
  );
}
