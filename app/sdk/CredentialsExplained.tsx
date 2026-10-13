import Link from "next/link";

const CREAM = "#E1E0CC";

interface CredentialCardProps {
  prefix: string;
  badgeLabel: string;
  badgeType: "secret" | "public";
  title: string;
  tagline: string;
  purpose: string;
  usage: string;
  securityNotice: string;
  docLinkHref: string;
  docLinkLabel: string;
  actionLinkHref?: string;
  actionLinkLabel?: string;
}

function CredentialCard({
  prefix,
  badgeLabel,
  badgeType,
  title,
  tagline,
  purpose,
  usage,
  securityNotice,
  docLinkHref,
  docLinkLabel,
  actionLinkHref,
  actionLinkLabel,
}: CredentialCardProps) {
  const isSecret = badgeType === "secret";

  return (
    <div
      className="flex flex-col justify-between rounded-xl p-6 transition"
      style={{
        border: `1px solid ${CREAM}15`,
        background: "#09090B",
      }}
    >
      <div>
        {/* Header: Prefix badge + Sensitivity pill */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <code
            className="rounded-md px-2.5 py-1 font-mono text-xs font-semibold select-all"
            style={{
              background: "#050608",
              border: `1px solid ${CREAM}20`,
              color: CREAM,
            }}
          >
            {prefix}
          </code>
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase"
            style={{
              background: isSecret ? "#F0A3A315" : "#9FD9A815",
              color: isSecret ? "#F0A3A3" : "#9FD9A8",
              border: `1px solid ${isSecret ? "#F0A3A330" : "#9FD9A830"}`,
            }}
          >
            {badgeLabel}
          </span>
        </div>

        {/* Title & Tagline */}
        <h3 className="text-base font-semibold leading-tight mb-1" style={{ color: CREAM }}>
          {title}
        </h3>
        <p className="text-xs font-medium italic mb-4" style={{ color: `${CREAM}70` }}>
          &ldquo;{tagline}&rdquo;
        </p>

        {/* Details list */}
        <div className="space-y-3 text-xs leading-5" style={{ color: `${CREAM}85` }}>
          <div>
            <span className="font-semibold block mb-0.5" style={{ color: `${CREAM}60` }}>
              PURPOSE
            </span>
            <p>{purpose}</p>
          </div>

          <div>
            <span className="font-semibold block mb-0.5" style={{ color: `${CREAM}60` }}>
              WHERE IT IS USED
            </span>
            <p>{usage}</p>
          </div>

          <div>
            <span className="font-semibold block mb-0.5" style={{ color: `${CREAM}60` }}>
              SECURITY & LIFECYCLE
            </span>
            <p>{securityNotice}</p>
          </div>
        </div>
      </div>

      {/* Footer Navigation Links */}
      <div className="mt-6 pt-4 border-t flex flex-wrap items-center justify-between gap-2 text-xs" style={{ borderColor: `${CREAM}10` }}>
        <a
          href={docLinkHref}
          className="underline transition hover:text-white"
          style={{ color: `${CREAM}80` }}
        >
          {docLinkLabel} &rarr;
        </a>
        {actionLinkHref && actionLinkLabel && (
          <a
            href={actionLinkHref}
            className="transition hover:text-white"
            style={{ color: `${CREAM}60` }}
          >
            {actionLinkLabel}
          </a>
        )}
      </div>
    </div>
  );
}

export default function CredentialsExplained() {
  return (
    <section
      id="credentials-explained"
      aria-label="Credentials Guide"
      className="rounded-2xl p-8 sm:p-10"
      style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}
    >
      <div className="max-w-3xl mb-8">
        <p className="mb-2 text-[0.7rem] uppercase tracking-[0.25em]" style={{ color: `${CREAM}60` }}>
          Security &amp; Architecture
        </p>
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: CREAM }}>
          Your credentials, explained
        </h2>
        <p className="mt-2 text-sm leading-7" style={{ color: `${CREAM}85` }}>
          StudentProof uses three distinct credentials across its two integration modes. Each credential has
          a dedicated purpose, specific usage context, and strict exposure rules.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 1. API Key — Wallet Verification */}
        <CredentialCard
          prefix="sp_live_..."
          badgeLabel="Server-side secret"
          badgeType="secret"
          title="API Key — Wallet Verification"
          tagline="API key for wallet/credential verification."
          purpose="Authenticates your backend requests to verify whether a student's crypto wallet holds an active credential on-chain."
          usage="Sent in the x-api-key HTTP header when calling GET /api/verify?wallet=0x... endpoint."
          securityNotice="Server-side secret. Must never be exposed in frontend JavaScript, mobile bundles, or public source control."
          docLinkHref="#wallet-verification"
          docLinkLabel="View verify endpoint docs"
          actionLinkHref="#api-access"
          actionLinkLabel="Manage API keys"
        />

        {/* 2. OAuth Client ID — Sign in with StudentProof */}
        <CredentialCard
          prefix="sp_client_..."
          badgeLabel="Public identifier"
          badgeType="public"
          title="OAuth Client ID — Sign in with StudentProof"
          tagline="OAuth client ID for Sign in with StudentProof."
          purpose="Uniquely identifies your registered application during the Sign in with StudentProof authorization flow."
          usage="Included as client_id in browser authorization redirect URLs (/sdk/connect, /sdk/authorize) and server token exchange."
          securityNotice="Public identifier. Not a secret. Safe to include in frontend links, browser redirects, and client-side code."
          docLinkHref="#oauth-flow"
          docLinkLabel="View OAuth flow docs"
          actionLinkHref="#oauth-apps"
          actionLinkLabel="Register application"
        />

        {/* 3. OAuth Client Secret — Sign in with StudentProof */}
        <CredentialCard
          prefix="sp_sk_..."
          badgeLabel="Server-side secret"
          badgeType="secret"
          title="OAuth Client Secret — Sign in with StudentProof"
          tagline="OAuth client secret used by the application's backend."
          purpose="Authenticates your application backend when exchanging a single-use authorization code for a signed student-status assertion."
          usage="Sent in the client_secret parameter of POST /api/sdk/token during server-to-server exchange."
          securityNotice="Server-side secret. Must never be included in browser code or committed to source control. Revealed only once upon initial creation or explicit rotation."
          docLinkHref="#oauth-token-exchange"
          docLinkLabel="View token exchange docs"
          actionLinkHref="#oauth-apps"
          actionLinkLabel="Manage OAuth apps"
        />
      </div>
    </section>
  );
}
