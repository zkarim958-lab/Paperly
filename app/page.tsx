import ToolApp from "@/components/home";
import { JsonLd } from "@/components/jsonld";
import { HOME_FAQS } from "@/lib/seo";
import { applySite } from "@/lib/site";
import { getSettings } from "@/lib/settings";

/*
 * HOME PAGE (server component): opens the Edit PDF tool. Metadata comes from
 * the root layout. Every other tool has its own page: see app/[slug]/page.tsx
 * and lib/seo.ts.
 */
export default async function HomePage() {
  const { siteName: SITE_NAME, siteUrl: SITE_URL } = await getSettings();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      {
        "@type": "WebApplication",
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any (web browser)",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        description: "Free, private, browser-based PDF tools: edit, merge, compress, split, convert and protect PDFs without uploading files.",
      },
      {
        "@type": "FAQPage",
        mainEntity: applySite(HOME_FAQS, SITE_NAME).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
  return (
    <>
      <JsonLd data={jsonLd} />
      <ToolApp />
    </>
  );
}
