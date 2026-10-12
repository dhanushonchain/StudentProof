"use client";

import { useEffect, useState } from "react";
import ApiKeyReveal from "./ApiKeyReveal";
import BusinessLoginButton from "@/app/api/auth/BusinessLoginButton";

const CREAM = "#E1E0CC";

const CURL_EXAMPLE = `curl "https://studentproof.app/api/verify?wallet=0xYourStudentWalletAddress" \\
  -H "x-api-key: sp_live_your_api_key"`;

const FETCH_EXAMPLE = `// Server-side (Node 18+) — never expose your API key in browser code.
// const res = await fetch(
//   "https://studentproof.app/api/verify?wallet=0xYourStudentWalletAddress",
//   { headers: { "x-api-key": process.env.STUDENTPROOF_API_KEY! } }
// );
// const { valid } = (await res.json()) as { valid: boolean };
//
// if (valid) {
//   // wallet holds an active, non-expired StudentProof credential
// }`;

const TYPESCRIPT_EXAMPLE = `async function verifyWallet(wallet: string): Promise<boolean> {
  const res = await fetch(
    \`https://studentproof.app/api/verify?wallet=\${encodeURIComponent(wallet)}\`,
    {
      headers: { "x-api-key": process.env.STUDENTPROOF_API_KEY! },
      // Credential status is always read live — do not cache approvals.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (res.status === 401) throw new Error("invalid API key");
  if (res.status === 400) throw new Error("malformed wallet address");
  if (res.status === 429) throw new Error("rate limited — back off and retry");
  if (!res.ok) throw new Error("verification unavailable — fail closed, do not grant access");
  return ((await res.json()) as { valid: boolean }).valid;
}`;

const PYTHON_EXAMPLE = `import os
import requests

resp = requests.get(
    "https://studentproof.app/api/verify",
    params={"wallet": "0xYourStudentWalletAddress"},
    headers={"x-api-key": os.environ["STUDENTPROOF_API_KEY"]},
    timeout=10,
)
if resp.status_code == 401:
    raise RuntimeError("invalid API key")
if resp.status_code == 400:
    raise RuntimeError("malformed wallet address")
if resp.status_code == 429:
    raise RuntimeError("rate limited — back off and retry")
resp.raise_for_status()  # 5xx means "unverifiable": fail closed, do not grant access
valid: bool = resp.json()["valid"]`;

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
export function SdkEndpointDocs() {  return (
    <>
      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          What this API does
        </h2>
        <p className="text-sm leading-7" style={{ color: `${CREAM}85` }}>
          This API answers one question: <span style={{ color: CREAM }}>does the wallet address you supply hold
          an active, non-expired StudentProof credential right now?</span> You pass a wallet address; it returns
          a boolean. There is no walletless student login here — your app collects the wallet address itself
          (from your own checkout, form, or connected wallet) and asks StudentProof to check it. For login
          without handling wallets, see “Sign in with StudentProof” below, which is a separate flow.
        </p>
      </div>

      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          Endpoint
        </h2>
        <p className="mb-4 text-sm leading-7" style={{ color: `${CREAM}85` }}>
          <code style={{ color: CREAM }}>GET https://studentproof.app/api/verify?wallet=0x...</code> — read-only.
          Authentication is the <code style={{ color: CREAM }}>x-api-key</code> request header holding your
          developer secret. CORS is open, so the endpoint is reachable from a browser, but{" "}
          <span style={{ color: CREAM }}>use your secret server-side only</span> — anyone who can read it can
          verify (and meter usage) as you. Query parameter{" "}
          <code style={{ color: CREAM }}>wallet</code> (required) must be a valid EVM address; the zero address
          is rejected. The check is a live on-chain read of{" "}
          <code style={{ color: CREAM }}>hasValidCredential()</code> on the StudentProof registry (Avalanche
          Fuji testnet) — nothing is cached, responses carry{" "}
          <code style={{ color: CREAM }}>Cache-Control: no-store</code>, and no student data is ever returned,
          only a boolean.
        </p>
        <CodeBlock>{CURL_EXAMPLE}</CodeBlock>
      </div>

      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          Response and status codes
        </h2>
        <p className="mb-4 text-sm leading-7" style={{ color: `${CREAM}85` }}>
          Success is <code style={{ color: CREAM }}>200 {"{ \"valid\": true | false }"}</code> —{" "}
          <code style={{ color: CREAM }}>true</code> only if the wallet holds at least one credential that is
          neither expired nor revoked. Every error is{" "}
          <code style={{ color: CREAM }}>{"{ \"error\": \"…\" }"}</code> with no student data:
        </p>
        <CodeBlock>{`200  { "valid": true }      wallet holds an active credential
200  { "valid": false }     valid address, no active credential
400  { "error": "…" }       missing or malformed "wallet" parameter
401  { "error": "…" }       missing, unknown, or revoked API key
429  { "error": "…" }       rate limit exceeded — Retry-After header (seconds)
502  { "error": "…" }       chain read failed — unverifiable, fail closed
503  { "error": "…" }       limiter unavailable — unverifiable, fail closed`}</CodeBlock>
        <p className="mt-4 text-sm leading-7" style={{ color: `${CREAM}85` }}>
          Error-handling rule: treat any non-200, any network failure, and any timeout as “cannot verify” and{" "}
          <span style={{ color: CREAM }}>deny the gated action or retry later — never grant it</span>. A{" "}
          <code style={{ color: CREAM }}>false</code> and an error are different outcomes: only{" "}
          <code style={{ color: CREAM }}>{"{ \"valid\": true }"}</code> is proof of student status.
        </p>
      </div>

      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          From a server (TypeScript)
        </h2>
        <CodeBlock>{TYPESCRIPT_EXAMPLE}</CodeBlock>
      </div>

      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          From a server (Python)
        </h2>
        <CodeBlock>{PYTHON_EXAMPLE}</CodeBlock>
      </div>

      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          From a browser or script (fetch)
        </h2>
        <p className="mb-4 text-sm leading-7" style={{ color: `${CREAM}85` }}>
          Works, but only with a key you can afford to expose — for anything real, proxy through your server.
        </p>
        <CodeBlock>{FETCH_EXAMPLE}</CodeBlock>
      </div>

      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          Rate limits
        </h2>
        <p className="text-sm leading-7" style={{ color: `${CREAM}85` }}>
          60 requests per minute per developer account (sliding window, shared across servers). Exceeding it
          returns <code style={{ color: CREAM }}>429</code> with a{" "}
          <code style={{ color: CREAM }}>Retry-After</code> header in seconds — back off and retry. If the
          limiter itself is unreachable the API fails closed with{" "}
          <code style={{ color: CREAM }}>503</code> rather than serving unverified answers.
        </p>
      </div>

      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          Get a key and test it
        </h2>
        <p className="text-sm leading-7" style={{ color: `${CREAM}85` }}>
          1. Use “Get API Access” above (Google sign-in) — your first key is shown once and emailed; only its
          hash is stored. 2. Create and revoke further keys anytime in “Your API keys”. 3. Test with the zero
          address (expect <code style={{ color: CREAM }}>400</code>), a wrong key (expect{" "}
          <code style={{ color: CREAM }}>401</code>), and any well-formed address (expect{" "}
          <code style={{ color: CREAM }}>200 {"{ \"valid\": … }"}</code>). Lost secret? Revoke the key and
          create a new one — secrets cannot be recovered.
        </p>
      </div>
    </>
  );
}

/* ---------------- OAuth flow docs (/sdk page only) ---------------- */
const AUTHORIZE_EXAMPLE = `// 1. Send the student to StudentProof (mode: signin or signup)
const params = new URLSearchParams({
  client_id: "sp_client_your_id",
  redirect_uri: "https://yourapp.com/auth/callback",
  state: "random-state-value",
  mode: "signin",
  code_challenge: "S256-challenge",
  code_challenge_method: "S256",
});
window.location.href = "https://studentproof.app/sdk/connect?" + params;`;

const TOKEN_EXAMPLE = `// 2. Exchange the returned code server-to-server
const res = await fetch("https://studentproof.app/api/sdk/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: "<code-from-redirect>",
    redirect_uri: "https://yourapp.com/auth/callback",
    client_id: "sp_client_your_id",
    client_secret: "<server-side-only>",
    code_verifier: "<original-verifier>",
  }),
});
const { assertion, expires_in } = await res.json();
// assertion: "v2.<kid>.<payload>.<sig>" — 5-minute Ed25519-signed proof.
// Verify it against GET https://studentproof.app/api/sdk/jwks (public JWKS):
// check the signature with the matching kid, then iss, aud (your client id),
// boolean vb, and exp. Only { valid: vb === true } gates access — any error
// path fails closed. See the standalone demo for a complete zero-dependency
// example (state + PKCE + exchange + JWKS verify + session).`;

export function SdkOAuthDocs() {
  return (
    <>
      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          Sign in with StudentProof
        </h2>
        <p className="mb-4 text-sm" style={{ color: `${CREAM}85` }}>
          Let students prove their status without sharing wallets or emails — and without
          your own Google OAuth client: StudentProof owns Google sign-in, and students
          never enter a wallet address anywhere. Register a client to get a{" "}
          <code style={{ color: CREAM }}>client_id</code> (contact the StudentProof team —
          v1 registration is manual), then redirect to{" "}
          <code style={{ color: CREAM }}>/sdk/connect</code> with PKCE S256. The student consents
          to sharing one fact only — whether they hold an active credential — and your{" "}
          <code style={{ color: CREAM }}>redirect_uri</code> receives a one-time code.
        </p>
        <p className="mb-4 text-sm" style={{ color: `${CREAM}85` }}>
          Google sign-in identifies the student; only the live credential check determines
          student status. Signing in with Google alone proves nothing — an account without
          a currently-valid credential verifies as{" "}
          <code style={{ color: CREAM }}>false</code>, and service outages fail closed
          instead of reporting <code style={{ color: CREAM }}>false</code>.
        </p>
        <CodeBlock>{AUTHORIZE_EXAMPLE}</CodeBlock>
      </div>

      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          Exchange the code
        </h2>
        <p className="mb-4 text-sm" style={{ color: `${CREAM}85` }}>
          Codes are single-use and expire in 10 minutes. Never expose the exchange in the
          browser — always call it from your server. The returned assertion is asymmetrically
          signed (Ed25519): anyone can verify it with the public JWKS, but only StudentProof
          can mint one — a verifier can never forge your students&apos; status.
        </p>
        <CodeBlock>{TOKEN_EXAMPLE}</CodeBlock>
      </div>

      <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
          Try the demo
        </h2>
        <p className="text-sm leading-7" style={{ color: `${CREAM}85` }}>
          A standalone zero-dependency demo website shows the whole login: authorize URL with
          random state and PKCE, callback validation, server-side exchange, JWKS assertion
          check, session cookie, and logout. Contact the StudentProof team for the demo source
          and a development client — v1 registration is manual.
        </p>
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
