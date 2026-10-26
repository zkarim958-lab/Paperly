import type { Metadata } from "next";
import { LegalShell, getLegal } from "@/components/legal";

export async function generateMetadata(): Promise<Metadata> {
  const { SITE_NAME } = await getLegal();
  return {
    title: "Contact Us",
    description: `Get in touch with the ${SITE_NAME} team.`,
    alternates: { canonical: "/contact" },
  };
}

export default async function ContactPage() {
  const { CONTACT_EMAIL, SITE_NAME } = await getLegal();
  return (
    <LegalShell title="Contact Us">
      <p>We&apos;d love to hear from you: bug reports, feature ideas, or questions about privacy and advertising.</p>
      <p>
        Email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <h2>Privacy and data requests</h2>
      <p>To ask about your data or to exercise a privacy right (access, deletion, objection, opting out of personalised ads), email us with the subject &quot;Privacy request&quot;. You can also change your advertising choice at any time from &quot;Cookie settings&quot; in the footer.</p>

      <h2>Before you write</h2>
      <ul>
        <li>Tell us which tool you were using and your browser and device (for example Chrome on Windows).</li>
        <li>Please do not email sensitive documents. We never need your files to investigate a problem.</li>
        <li>We cannot recover forgotten PDF passwords, because your files and passwords never reach us.</li>
      </ul>
    </LegalShell>
  );
}
