import type { Metadata } from "next";
import { LAST_UPDATED, LegalShell, getLegal } from "@/components/legal";
import { CookieSettingsLink } from "@/components/cookie-settings-link";

export async function generateMetadata(): Promise<Metadata> {
  const { SITE_NAME } = await getLegal();
  return {
    title: "Privacy Policy",
    description: `How ${SITE_NAME} handles your files, cookies, advertising and your data protection rights (GDPR, UK GDPR, CCPA/CPRA, PIPEDA, Australian Privacy Act).`,
    alternates: { canonical: "/privacy" },
  };
}

export default async function PrivacyPage() {
  const { CONTACT_EMAIL, OPERATOR_ADDRESS, OPERATOR_NAME, SITE_NAME } = await getLegal();
  return (
    <LegalShell title="Privacy Policy">
      <p>Last updated: {LAST_UPDATED}</p>
      <p>
        {SITE_NAME} provides PDF and image tools that run inside your web browser. This policy explains what personal
        data is and is not processed when you use the site, why, and what rights you have.
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        The data controller is {OPERATOR_NAME}
        {OPERATOR_ADDRESS ? `, ${OPERATOR_ADDRESS}` : ""}. You can contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> about anything in this policy.
      </p>

      <h2>2. Your files stay on your device</h2>
      <p>
        When you edit, merge, compress, split, convert, protect or unlock a file, the work is done by code running in
        your own browser. Your files, the text in them, and any passwords you type are not uploaded to, received by or
        stored on our servers. We therefore hold no copy of your documents and cannot recover them or a forgotten PDF
        password.
      </p>

      <h2>3. What we and our providers do process</h2>
      <ul>
        <li>
          <strong>Browser storage (on your device only).</strong> Your light or dark theme and your cookie choice are
          saved in your browser&apos;s local storage. They are not sent to us. The theme setting is needed to remember
          your preference; the cookie choice is needed to remember your decision.
        </li>
        <li>
          <strong>Server logs.</strong> Our hosting provider may keep standard technical logs (IP address, browser type,
          requested page, time) to deliver the site, keep it secure and prevent abuse. They never contain your files.
        </li>
        <li>
          <strong>Text recognition (OCR) engine.</strong> The first time you use &quot;Scan text&quot; in the PDF
          editor, your browser downloads the recognition engine and language data from a public content delivery
          network (jsDelivr by default). That provider can see your IP address and browser details, as with any web
          request. Your document is not sent there. The site operator can host these files on our own domain instead.
        </li>
        <li>
          <strong>Advertising.</strong> If you allow it, Google AdSense receives data from your browser to show ads (see
          section 5).
        </li>
        <li>
          <strong>Messages you send.</strong> If you email us, we process your email address and message to reply.
        </li>
      </ul>

      <h2>4. Legal bases (UK and EU GDPR)</h2>
      <ul>
        <li>
          <strong>Consent</strong> (Article 6(1)(a) and ePrivacy rules) for advertising cookies and similar technologies,
          including personalised advertising. You can withdraw consent at any time; withdrawal does not affect earlier
          processing.
        </li>
        <li>
          <strong>Legitimate interests</strong> (Article 6(1)(f)) for delivering, securing and improving the site,
          including server logs, and for answering your messages.
        </li>
        <li>
          <strong>Legal obligation</strong> (Article 6(1)(c)) where we must keep or disclose data by law.
        </li>
      </ul>

      <h2>5. Advertising and cookies</h2>
      <p>
        We use Google AdSense to show ads, which keeps the tools free. Google and its partners may use cookies and
        similar technologies to serve and measure ads, and, only if you allow it, to personalise them based on your
        visits to this and other websites.
      </p>
      <ul>
        <li>
          <strong>United Kingdom, EU/EEA and Switzerland:</strong> no advertising script is loaded and no advertising
          cookie is set until you choose &quot;Accept all&quot;. If you reject, no ads are shown to you.
        </li>
        <li>
          <strong>Elsewhere (for example the US, Canada and Australia):</strong> ads are non-personalised by default.
          Personalised ads are used only if you choose &quot;Accept all&quot;.
        </li>
        <li>
          <strong>Global Privacy Control:</strong> if your browser sends a Global Privacy Control signal, we treat it as
          an opt-out of personalised advertising.
        </li>
        <li>
          <strong>Change your mind:</strong> use <CookieSettingsLink /> at any time. Withdrawing consent reloads the
          page so ad cookies stop being used.
        </li>
      </ul>
      <p>Useful links:</p>
      <ul>
        <li>
          How Google uses information from sites that use its services:{" "}
          <a href="https://policies.google.com/technologies/partner-sites" rel="noopener noreferrer" target="_blank">policies.google.com/technologies/partner-sites</a>
        </li>
        <li>
          Manage personalised advertising: <a href="https://adssettings.google.com" rel="noopener noreferrer" target="_blank">adssettings.google.com</a>
        </li>
        <li>
          Opt out of many third-party ad vendors: <a href="https://www.aboutads.info" rel="noopener noreferrer" target="_blank">aboutads.info</a> and <a href="https://www.youronlinechoices.eu" rel="noopener noreferrer" target="_blank">youronlinechoices.eu</a>
        </li>
      </ul>

      <h2>6. Who receives data</h2>
      <p>
        Our hosting provider, Google (advertising) and, when you use OCR, the content delivery network that serves the
        recognition engine. We do not sell your personal data for money. We do not receive or share the contents of your
        files.
      </p>

      <h2>7. International transfers</h2>
      <p>
        Google and our hosting and delivery providers may process data in countries outside your own, including the
        United States. Where UK or EU data is transferred, it relies on safeguards such as adequacy decisions, the UK
        and EU Data Privacy Framework or standard contractual clauses put in place by those providers.
      </p>

      <h2>8. How long data is kept</h2>
      <p>
        Browser-storage items stay until you clear your browser data. Server logs are kept for a limited period set by
        our hosting provider. Emails you send us are kept only as long as needed to deal with your message. Data held
        by Google is governed by Google&apos;s own policies.
      </p>

      <h2>9. Your rights in the UK and EU</h2>
      <p>
        You have the right to access your personal data, to have it corrected or erased, to restrict or object to its
        processing, to data portability, and to withdraw consent at any time. You may also complain to your data
        protection authority, for example the Information Commissioner&apos;s Office (ico.org.uk) in the UK. Because we do
        not receive your files and hold very little personal data, there is often nothing to retrieve, but we will
        always answer your request.
      </p>

      <h2>10. California (CCPA/CPRA) and other US states</h2>
      <p>
        In the last 12 months we have not sold personal information for money. Advertising partners may collect
        identifiers and internet-activity data through cookies when you allow personalised ads, which some laws treat as
        &quot;sharing&quot; for cross-context behavioural advertising. You can opt out at any time with <CookieSettingsLink /> or
        a Global Privacy Control signal, and we will not discriminate against you for doing so. You may ask us what
        personal information we hold about you, ask us to delete it, or ask us to correct it, by emailing us. We do not
        knowingly collect sensitive personal information.
      </p>

      <h2>11. Canada and Australia</h2>
      <p>
        We handle personal information in line with Canada&apos;s PIPEDA and the Australian Privacy Principles. You may
        ask for access to or correction of your information, and complain to us or to the Office of the Privacy
        Commissioner of Canada or the Office of the Australian Information Commissioner (oaic.gov.au).
      </p>

      <h2>12. Children</h2>
      <p>
        The site is not directed at children under 16, and we do not knowingly collect personal information from them.
        If you believe a child has given us personal information, contact us and we will delete it.
      </p>

      <h2>13. Security</h2>
      <p>
        The site is served over HTTPS. Because your documents are processed only in your browser, they are not exposed
        to our servers.
      </p>

      <h2>14. Changes to this policy</h2>
      <p>We may update this policy and will change the date above when we do.</p>

      <h2>15. Contact</h2>
      <p>
        Questions or requests? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalShell>
  );
}
