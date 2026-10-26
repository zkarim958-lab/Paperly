import type { ReactNode } from "react";
import { getSettings } from "@/lib/settings";

export const LAST_UPDATED = "October 2026";

/** Site name, contact and operator details, as saved in the admin panel (/admin). */
export async function getLegal() {
  const s = await getSettings();
  return {
    SITE_NAME: s.siteName,
    CONTACT_EMAIL: s.contactEmail,
    OPERATOR_NAME: s.operatorName || `the operator of ${s.siteName}`,
    OPERATOR_ADDRESS: s.operatorAddress,
    OPERATOR_COUNTRY: s.operatorCountry,
  };
}

/** Shared page shell for Privacy, Terms and Contact (server component). */
export async function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  const { SITE_NAME } = await getLegal();
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200/70 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">{SITE_NAME}</a>
          <a href="/" className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-300">Back to tools</a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">{title}</h1>
        <div className="mt-8 space-y-5 text-base leading-relaxed text-zinc-700 dark:text-zinc-300 [&_a]:font-medium [&_a]:text-zinc-900 [&_a]:underline dark:[&_a]:text-zinc-300 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-zinc-900 dark:[&_h2]:text-white [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
          {children}
        </div>
      </main>
      <footer className="border-t border-zinc-200/70 py-6 text-center text-xs text-zinc-500 dark:border-white/10">
        <a href="/about" className="mx-2 hover:underline">About</a>
        <a href="/privacy" className="mx-2 hover:underline">Privacy Policy</a>
        <a href="/terms" className="mx-2 hover:underline">Terms of Service</a>
        <a href="/contact" className="mx-2 hover:underline">Contact Us</a>
      </footer>
    </div>
  );
}
