"use client";

import { useEffect, useState } from "react";
import ApiKeyReveal from "./ApiKeyReveal";
import BusinessLoginButton from "@/app/api/auth/BusinessLoginButton";

const CREAM = "#E1E0CC";

const CURL_EXAMPLE = `curl "https://studentproof.app/api/verify?wallet=0xYourStudentWalletAddress" \\
  -H "x-api-key: sp_live_your_api_key"`;

const FETCH_EXAMPLE = `const res = await fetch(
  "https://studentproof.app/api/verify?wallet=0xYourStudentWalletAddress",
  { headers: { "x-api-key": "sp_live_your_api_key" } }
);
const { valid } = await res.json();

if (valid) {
  // wallet holds an active, non-expired StudentProof credential
}`;

const CodeBlock = ({ children }: { children: string }) => (
  <pre
    className="overflow-x-auto rounded-xl p-4 text-sm leading-6"
    style={{ background: "#09090B", border: `1px solid ${CREAM}15`, color: CREAM }}
  >
    <code>{children}</code>
  </pre>
);

/* ---------------- Access panel (shared by /sdk page and docs modal) ---------------- */
export function SdkAccessPanel({
  businessId,
  freshApiKey,
}: {
  businessId?: string | null;
  freshApiKey?: string | null;
}) {
  return (
    <div className="rounded-2xl p-10 text-center" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
      {freshApiKey ? (
        <>
          <h2 className="text-lg font-semibold" style={{ color: CREAM }}>
            You&apos;re in — Free Beta access is active
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: `${CREAM}85` }}>
            Here is your API key. We&apos;ve also emailed it, but this is the only time it will
            be shown in full — we only store a hash of it, not the key itself. Free Beta means
            this is free for now, while we&apos;re in beta — not a permanent promise.
          </p>
          <div className="mx-auto mt-6 max-w-md">
            <ApiKeyReveal apiKey={freshApiKey} />
          </div>
        </>
      ) : businessId ? (
        <>
          <h2 className="text-lg font-semibold" style={{ color: CREAM }}>
            Free Beta access is active
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: `${CREAM}85` }}>
            You already have an API key from when you first signed up — check your inbox for the
            email we sent. For security we only ever store a hash of it, so we can&apos;t show it
            again here.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold" style={{ color: CREAM }}>
            Get API Access (Free Beta)
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: `${CREAM}85` }}>
            Sign in with Google to get an API key instantly — no approval, and free while
            we&apos;re in beta.
          </p>
          <div className="mx-auto mt-6 max-w-xs">
            <BusinessLoginButton />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Endpoint docs (shared by /sdk page and docs modal) ---------------- */
export function SdkEndpointDocs() {
  return (
    <>
      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          Endpoint
        </h2>
        <p className="mb-4 text-sm" style={{ color: `${CREAM}85` }}>
          <code style={{ color: CREAM }}>GET /api/verify?wallet=0x...</code> — read-only, requires
          your API key as the <code style={{ color: CREAM }}>x-api-key</code> header. CORS is open,
          so it can be called directly from a browser as well as a server. It calls{" "}
          <code style={{ color: CREAM }}>hasValidCredential()</code> directly on StudentProof&apos;s
          deployed smart contract on Avalanche (Fuji testnet) and returns the live result — nothing
          is cached, and no student data is ever returned, only a boolean.
        </p>
        <CodeBlock>{CURL_EXAMPLE}</CodeBlock>
      </div>

      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          Response
        </h2>
        <p className="mb-4 text-sm" style={{ color: `${CREAM}85` }}>
          A JSON object with a single field:
        </p>
        <CodeBlock>{`{ "valid": true }`}</CodeBlock>
        <p className="mt-4 text-sm" style={{ color: `${CREAM}85` }}>
          <code style={{ color: CREAM }}>valid</code> is <code style={{ color: CREAM }}>true</code>{" "}
          only if the wallet holds at least one credential that is neither expired nor revoked. A
          missing or invalid <code style={{ color: CREAM }}>x-api-key</code> returns{" "}
          <code style={{ color: CREAM }}>401</code>; a missing or malformed{" "}
          <code style={{ color: CREAM }}>wallet</code> parameter returns{" "}
          <code style={{ color: CREAM }}>400</code> — both with an{" "}
          <code style={{ color: CREAM }}>error</code> field instead of <code style={{ color: CREAM }}>valid</code>.
        </p>
      </div>

      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          From a browser or server (fetch)
        </h2>
        <CodeBlock>{FETCH_EXAMPLE}</CodeBlock>
      </div>
    </>
  );
}

/* ---------------- Modal content: same SDK UI, session loaded client-side ---------------- */
type SdkSessionState =
  | { status: "loading" }
  | { status: "ready"; businessId?: string | null; freshApiKey?: string | null };

function readSessionFields(data: unknown): { businessId?: string | null; freshApiKey?: string | null } {
  if (!data || typeof data !== "object") return {};
  const user = (data as { user?: unknown }).user;
  if (!user || typeof user !== "object") return {};
  const record = user as Record<string, unknown>;
  const businessId = typeof record.businessId === "string" ? record.businessId : null;
  const freshApiKey = typeof record.businessApiKeyOnce === "string" ? record.businessApiKeyOnce : null;
  return { businessId, freshApiKey };
}

export function SdkModalContent() {
  const [state, setState] = useState<SdkSessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        const { businessId, freshApiKey } = readSessionFields(data);
        setState({ status: "ready", businessId, freshApiKey });
      })
      .catch(() => {
        // Session unreadable (e.g. offline) — fall back to signed-out UI
        // rather than blocking the docs.
        if (!cancelled) setState({ status: "ready" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl p-10 text-center" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <p className="text-sm" style={{ color: `${CREAM}85` }}>
          Loading…
        </p>
      </div>
    );
  }

  return (
    <>
      <SdkAccessPanel businessId={state.businessId} freshApiKey={state.freshApiKey} />
      <SdkEndpointDocs />
    </>
  );
}
