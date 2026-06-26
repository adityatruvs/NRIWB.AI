import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — NRIWB",
  description:
    "How NRIWB collects, uses, secures, and shares your personal and financial information, and the rights you have over it.",
};

const EFFECTIVE_DATE = "June 23, 2026";
const CONTACT_EMAIL = "privacy@nriwb.ai";

// Subprocessors we disclose. Keep this in sync with the vendors that actually
// touch customer data — Plaid (bank links), Anthropic (AI copilot), Neon
// (database), Clerk (auth), Vercel (hosting).
const SUBPROCESSORS: { name: string; purpose: string; location: string }[] = [
  {
    name: "Plaid Inc.",
    purpose:
      "Securely connects your bank and brokerage accounts and retrieves balances and account details. We never receive or store your bank login credentials.",
    location: "United States",
  },
  {
    name: "Anthropic, PBC",
    purpose:
      "Powers the AI wealth copilot. Portfolio data you ask about is sent to Anthropic to generate a response; it is not used to train their models.",
    location: "United States",
  },
  {
    name: "Neon, Inc.",
    purpose:
      "Hosts our application database, where your profile and encrypted connection tokens are stored.",
    location: "United States",
  },
  {
    name: "Clerk, Inc.",
    purpose:
      "Provides account authentication, including multi-factor authentication.",
    location: "United States",
  },
  {
    name: "Vercel Inc.",
    purpose: "Hosts and serves the NRIWB application.",
    location: "United States",
  },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-xl font-medium tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="relative min-h-screen">
      <div aria-hidden className="hero-mesh" />

      {/* Simple public header */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="icon-chip h-8 w-8 text-base font-bold">N</span>
            <span className="text-lg font-semibold tracking-tight">NRIWB</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Back to home
          </Link>
        </div>
      </header>

      <article className="mx-auto w-full max-w-3xl px-6 py-12">
        <p className="eyebrow">Legal</p>
        <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Effective {EFFECTIVE_DATE}
        </p>

        <p className="mt-6 text-[15px] leading-relaxed text-muted-foreground">
          NRIWB (&ldquo;NRIWB,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) helps Non-Resident Indians see and manage their
          wealth across the United States and India. This policy explains what
          personal and financial information we collect, how we use and protect
          it, who we share it with, and the choices and rights you have. By
          using NRIWB you agree to the practices described here.
        </p>

        <Section title="Information we collect">
          <p>We collect the following categories of information:</p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <span className="font-medium text-foreground">
                Account information.
              </span>{" "}
              Your name, email address, and authentication details, collected
              when you create an account. Authentication is handled by Clerk.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Financial account information.
              </span>{" "}
              When you link a bank or brokerage account through Plaid, we
              receive account names, types, balances, and institution details.
              We receive a Plaid access token, which we store in encrypted form.
              We do not receive or store your bank login credentials.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Profile and preferences.
              </span>{" "}
              Information you provide during onboarding, such as residency
              details and financial goals, used to tailor compliance insights.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Usage and device information.
              </span>{" "}
              Standard log and device data generated when you use the service.
            </li>
          </ul>
        </Section>

        <Section title="How we use your information">
          <ul className="ml-5 list-disc space-y-2">
            <li>To provide your unified net-worth view across the US and India.</li>
            <li>
              To compute cross-border compliance signals (e.g., FBAR, FATCA, and
              PFIC indicators) from your balances.
            </li>
            <li>
              To answer your questions through the AI wealth copilot, using your
              portfolio data to generate relevant responses.
            </li>
            <li>To secure your account, authenticate you, and prevent fraud.</li>
            <li>To operate, maintain, and improve the service.</li>
          </ul>
          <p>
            We do not sell your personal information, and we do not use your
            financial data for advertising.
          </p>
        </Section>

        <Section title="How we share your information">
          <p>
            We share information only with service providers
            (&ldquo;subprocessors&rdquo;) who process it on our behalf to deliver
            the service, and only as needed for the purposes below. Each is
            bound by contract to protect your data:
          </p>
          <div className="mt-2 overflow-hidden rounded-xl border border-border/70">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-muted/60 text-foreground">
                  <th className="px-4 py-2.5 font-medium">Provider</th>
                  <th className="px-4 py-2.5 font-medium">Purpose</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                </tr>
              </thead>
              <tbody>
                {SUBPROCESSORS.map((s) => (
                  <tr key={s.name} className="border-t border-border/60 align-top">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.purpose}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.location}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            We may also disclose information if required by law, to comply with
            legal process, or to protect the rights, property, or safety of
            NRIWB, our users, or others.
          </p>
        </Section>

        <Section title="How we protect your information">
          <ul className="ml-5 list-disc space-y-2">
            <li>
              Sensitive data, including Plaid access tokens, is encrypted at rest
              using AES-256-GCM.
            </li>
            <li>All data in transit is protected with TLS.</li>
            <li>
              Access is scoped to your account: every request is authenticated
              and authorized to your user identity.
            </li>
            <li>Multi-factor authentication is available and encouraged.</li>
          </ul>
          <p>
            No method of transmission or storage is completely secure, but we
            maintain administrative, technical, and physical safeguards designed
            to protect your information consistent with applicable law,
            including the Gramm-Leach-Bliley Act (GLBA) and the FTC Safeguards
            Rule.
          </p>
        </Section>

        <Section title="Data retention and disposal">
          <p>
            We keep your information for as long as your account is active or as
            needed to provide the service. When information is no longer needed,
            or upon a valid deletion request, we securely dispose of it. You can
            disconnect a linked institution at any time, which revokes the
            associated access token and purges it from our systems.
          </p>
        </Section>

        <Section title="Your rights and choices">
          <p>
            Depending on where you live, you may have the right to access,
            correct, delete, or obtain a copy of your personal information, and
            to ask us not to sell or share it (we do not sell it). California
            residents have these rights under the CCPA/CPRA. To exercise any of
            these rights, contact us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-brand hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            . You can also disconnect linked accounts and request deletion of
            your data from within the app. We will not discriminate against you
            for exercising these rights.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>
            NRIWB is not directed to children under 18, and we do not knowingly
            collect personal information from them.
          </p>
        </Section>

        <Section title="International users">
          <p>
            NRIWB is operated from the United States, and the subprocessors
            above process data in the United States. If you access the service
            from outside the United States, you understand your information will
            be processed there.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. When we do, we will
            revise the effective date above and, where appropriate, notify you.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about this policy or your information? Email us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-brand hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </article>
    </main>
  );
}
