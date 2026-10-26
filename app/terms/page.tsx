import type { Metadata } from "next";
import { LAST_UPDATED, LegalShell, getLegal } from "@/components/legal";

export async function generateMetadata(): Promise<Metadata> {
  const { SITE_NAME } = await getLegal();
  return {
    title: "Terms of Service",
    description: `The terms for using ${SITE_NAME}.`,
    alternates: { canonical: "/terms" },
  };
}

export default async function TermsPage() {
  const { CONTACT_EMAIL, OPERATOR_COUNTRY, OPERATOR_NAME, SITE_NAME } = await getLegal();
  return (
    <LegalShell title="Terms of Service">
      <p>Last updated: {LAST_UPDATED}</p>
      <p>By using {SITE_NAME} you agree to these terms. If you do not agree, please do not use the site.</p>

      <h2>The service</h2>
      <p>
        {SITE_NAME} offers free, browser-based tools for working with PDF and image files. The tools run on your own
        device, so how well they perform depends on your browser and hardware.
      </p>

      <h2>Your files and responsibility</h2>
      <ul>
        <li>You are responsible for the files you process and for having the right to use them.</li>
        <li>Keep your own backups. We never receive your files, so we cannot recover them.</li>
        <li>We cannot recover forgotten PDF passwords.</li>
        <li>Do not use the tools to process content that is illegal or that you have no right to unlock or alter.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        Do not interfere with the site, attempt to disrupt it, or use automated means to overload it. Do not click on
        ads artificially or encourage others to.
      </p>

      <h2>No warranty</h2>
      <p>
        The site is provided &quot;as is&quot; without warranties of any kind. Compression, conversion and encryption
        results can vary between files, and we do not guarantee that output files will be identical in appearance or
        content to the originals. Always check results before relying on them.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent permitted by law, we are not liable for any loss or damage arising from your use of the site,
        including loss of data.
      </p>

      <h2>Advertising and third-party links</h2>
      <p>
        The site shows ads from third parties. We are not responsible for the content of third-party sites or ads.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The site, its design and its code belong to {OPERATOR_NAME} or its licensors. Your files remain yours. We claim
        no rights in them and never receive them.
      </p>

      <h2>Governing law</h2>
      <p>
        {OPERATOR_COUNTRY
          ? `These terms are governed by the laws of ${OPERATOR_COUNTRY}, without affecting any mandatory consumer rights you have where you live.`
          : "These terms are governed by the law of the country where the site operator is based, without affecting any mandatory consumer rights you have where you live."}
      </p>

      <h2>Changes</h2>
      <p>We may update these terms and will change the date above when we do. Continued use means you accept the updated terms.</p>

      <h2>Contact</h2>
      <p>
        Questions? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalShell>
  );
}
