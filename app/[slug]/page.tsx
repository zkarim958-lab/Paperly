import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ToolApp from "@/components/home";
import { JsonLd } from "@/components/jsonld";
import { LANDINGS, LANDING_BY_SLUG, absoluteUrl, landingFaqs, landingPath } from "@/lib/seo";
import { applySite } from "@/lib/site";
import { getSettings } from "@/lib/settings";

/*
 * ONE LANDING PAGE PER SEARCH INTENT (merge-pdf, pdf-to-jpg, unlock-pdf ...).
 * Pages are generated at build time from lib/seo.ts. Anything not listed there
 * is a 404 (dynamicParams = false). Static routes such as /privacy, /terms,
 * /contact and /about take priority over this dynamic one.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return LANDINGS.map((l) => ({ slug: l.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { siteName: SITE_NAME } = await getSettings();
  const l0 = LANDING_BY_SLUG[slug];
  if (!l0) return {};
  const l = applySite(l0, SITE_NAME);
  const url = landingPath(l.slug);
  return {
    title: l.title,
    description: l.description,
    keywords: l.keywords,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: SITE_NAME, title: `${l.title} | ${SITE_NAME}`, description: l.description, url },
    twitter: { card: "summary_large_image", title: `${l.title} | ${SITE_NAME}`, description: l.description },
  };
}

export default async function LandingPage({ params }: Props) {
  const { slug } = await params;
  const l0 = LANDING_BY_SLUG[slug];
  if (!l0) notFound();
  const { siteName: SITE_NAME, siteUrl } = await getSettings();
  const l = applySite(l0, SITE_NAME);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: `${SITE_NAME} ${l.name}`,
        url: absoluteUrl(landingPath(l.slug), siteUrl),
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any (web browser)",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        description: l.description,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/", siteUrl) },
          { "@type": "ListItem", position: 2, name: l.name, item: absoluteUrl(landingPath(l.slug), siteUrl) },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: landingFaqs(l).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <ToolApp landing={l0} />
    </>
  );
}
