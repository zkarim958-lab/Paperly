import type { Metadata, Viewport } from "next";
import { AdSenseLoader } from "@/components/consent";
import { SiteProvider } from "@/components/site-context";
import { getLogoInfo, getPublicSite, getSettings } from "@/lib/settings";
import "./globals.css";

// Pages are rebuilt in the background at most once a minute, so admin changes show up quickly.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const { hasLogo, logoVersion } = await getLogoInfo();
  const name = s.siteName;
  return {
    metadataBase: new URL(s.siteUrl),
    title: { default: s.homeTitle, template: `%s | ${name}` },
    description: s.homeDescription,
    keywords: [
      "edit PDF",
      "merge PDF",
      "compress PDF",
      "split PDF",
      "rotate PDF",
      "PDF to Word",
      "PDF to Excel",
      "PDF to PPT",
      "Word to PDF",
      "Excel to PDF",
      "PDF to JPG",
      "JPG to PDF",
      "protect PDF with password",
      "unlock PDF",
      "free PDF tools",
      "private PDF editor",
    ],
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: name,
      title: s.homeTitle,
      description: s.homeDescription,
      url: s.siteUrl,
    },
    twitter: { card: "summary_large_image", title: s.homeTitle, description: s.homeDescription },
    robots: { index: true, follow: true },
    ...(hasLogo ? { icons: { icon: `/api/logo?v=${logoVersion}`, apple: `/api/logo?v=${logoVersion}` } } : {}),
    ...(s.googleSiteVerification ? { verification: { google: s.googleSiteVerification } } : {}),
    // Lets Google verify site ownership for AdSense without a visible script.
    other: s.adsenseClient ? { "google-adsense-account": s.adsenseClient } : {},
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffaf5" },
    { media: "(prefers-color-scheme: dark)", color: "#14110f" },
  ],
};

// Runs before first paint so there is no light/dark flash on load.
// Light (white and orange) is the default. Dark is used only when the visitor picked it with the toggle.
const themeInit = `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getPublicSite();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="bg-[#fffaf5] text-zinc-900 antialiased dark:bg-[#14110f] dark:text-zinc-100">
        <SiteProvider value={site}>
          {children}
        {/*
          GOOGLE ADSENSE LOADER: not a static script. <AdSenseLoader /> adds
          Google's script only when the visitor's region and consent allow ads
          (see components/consent.tsx), so no ad cookie is set before that.
          Individual ad units are rendered by <AdSlot /> in components/ui.tsx.
        */}
          {site.adsenseClient ? <AdSenseLoader /> : null}
        </SiteProvider>
      </body>
    </html>
  );
}
