import type { Metadata } from "next";
import { LANDINGS, landingPath } from "@/lib/seo";
import { applySite } from "@/lib/site";
import { LegalShell, getLegal } from "@/components/legal";

export async function generateMetadata(): Promise<Metadata> {
  const { SITE_NAME } = await getLegal();
  return {
    title: "About",
    description: `What ${SITE_NAME} is, how it works and why your files stay on your device.`,
    alternates: { canonical: "/about" },
  };
}

export default async function AboutPage() {
  const { CONTACT_EMAIL, SITE_NAME } = await getLegal();
  return (
    <LegalShell title={`About ${SITE_NAME}`}>
      <p>
        {SITE_NAME} is a free set of PDF and image tools that run inside your web browser. You can edit, merge,
        compress, split, convert and password-protect documents without creating an account.
      </p>

      <h2>Why it is private</h2>
      <p>
        Most online PDF tools upload your document to a server. {SITE_NAME} does the work with code running on your own
        device, so contracts, invoices and ID documents are not sent to us. You can confirm this by watching the Network
        tab in your browser&apos;s developer tools while you use a tool.
      </p>

      <h2>How the site is paid for</h2>
      <p>
        The tools are free. The site shows ads from Google AdSense, and you choose whether those ads may be
        personalised. Read the <a href="/privacy">Privacy Policy</a> for details.
      </p>

      <h2>Our tools</h2>
      <ul>
        {applySite(LANDINGS, SITE_NAME).map((l) => (
          <li key={l.slug}>
            <a href={landingPath(l.slug)}>{l.name}</a>
          </li>
        ))}
      </ul>

      <h2>Get in touch</h2>
      <p>
        Bug reports and ideas are welcome at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalShell>
  );
}
