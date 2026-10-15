"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const CREAM = "#E1E0CC";

const AGENT_PROMPT = `You are integrating AI code verification (student status) into an app. Use the StudentProof SDK (@studentproof/sdk) to check whether a student has a valid, non-expired StudentProof credential.

## Setup
1. Install the package:
   npm install @studentproof/sdk
   # or: yarn add @studentproof/sdk

2. Get credentials from the StudentProof dashboard at https://studentproof.app/sdk (sign in with Google):
   - API key (sp_live_...) for the wallet verification API
   - OAuth client_id + client_secret for "Sign in with StudentProof"

## Option A: Wallet-based verification (check an existing wallet address)
Use when your app already has the student's wallet address (from your own wallet connection) and just needs to verify student status.

const res = await fetch(
  \`https://studentproof.app/api/verify?wallet=\${encodeURIComponent(walletAddress)}\`,
  {
    method: "GET",
    headers: {
      "x-api-key": process.env.STUDENTPROOF_API_KEY!,  // server-side only
      "Cache-Control": "no-store",
    },
    signal: AbortSignal.timeout(10_000),
  }
);

if (!res.ok) {
  // 401 = invalid/revoked API key, 400 = malformed wallet, 429 = rate limited, 502/503 = fail closed
  throw new Error("Verification unavailable — fail closed, do not grant access");
}

const { valid } = await res.json() as { valid: boolean };
// valid === true means the wallet holds an active, non-expired, non-revoked credential
// valid === false means a valid address with no active credential

## Option B: Walletless sign-in with StudentProof (OAuth code flow)
Use when you want students to sign in using StudentProof (which handles Google OAuth and university portal verification for them) — no wallet needed.

// Frontend: build the authorize URL with PKCE
import { buildAuthorizeUrl, generateState, createPkcePair } from "@studentproof/sdk";

const state = generateState();
const { verifier, challenge } = await createPkcePair();
// Store { state, verifier } server-side (signed httpOnly cookie or server store) with short TTL
const authUrl = buildAuthorizeUrl({
  clientId: "sp_client_YOUR_CLIENT_ID",
  redirectUri: "https://yourapp.com/api/auth/callback",
  state,
  codeChallenge: challenge,
  mode: "signin", // or "signup"
});
window.location.href = authUrl;

// Backend: exchange the code + verify the assertion (server-side only — never expose client_secret or verifier in browser)
import { exchangeAuthorizationCode } from "@studentproof/sdk";
import { verifyStudentAssertion } from "@studentproof/sdk/server";

const { assertion } = await exchangeAuthorizationCode({
  code: body.code,
  redirectUri: "https://yourapp.com/api/auth/callback",
  clientId: "sp_client_YOUR_CLIENT_ID",
  clientSecret: process.env.STUDENTPROOF_CLIENT_SECRET!,
  codeVerifier: storedVerifier,
});

const { valid, sub } = await verifyStudentAssertion({
  assertion,
  expectedAud: "sp_client_YOUR_CLIENT_ID",
  expectedIss: "https://studentproof.app",
});
// valid === true and sub is a stable per-app student identifier — grant access
// Any thrown error (InvalidAssertionError, VerificationUnavailableError, etc.) = fail closed, do not grant

## Key rules
- API keys / client secrets are server-side only — NEVER in browser or client code
- Treat 502/503/timeouts/network failures as "cannot verify" — fail closed (deny access or retry later)
- valid: false and transport errors are different outcomes — only { valid: true } grants access
- Wallet verification is a live on-chain read (no caching; Cache-Control: no-store)
- Assertion tokens are 5-minute Ed25519-signed, verified against public JWKS at https://studentproof.app/api/sdk/jwks
`;

export default function AgentIntegrationPrompt() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(AGENT_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="rounded-2xl p-10"
      style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: CREAM }}>
            SDK integration prompt
          </h2>
          <p className="mt-1 text-sm leading-6" style={{ color: `${CREAM}85` }}>
            Copy this prompt and paste it into Cursor, Claude Code, or any other AI coding agent to
            generate a StudentProof integration in your codebase. It covers both the wallet verification API
            and the walletless OAuth sign-in flow.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-xl border px-4 py-2.5 text-xs font-medium transition hover:opacity-80"
          style={{ borderColor: `${CREAM}30`, color: CREAM }}
        >
          <div className="flex items-center gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy prompt"}
          </div>
        </button>
      </div>

      <pre
        className="max-h-96 overflow-y-auto rounded-xl p-4 text-xs leading-5"
        style={{
          background: "#09090B",
          border: `1px solid ${CREAM}20`,
          color: `${CREAM}80`,
        }}
      >
        <code>{AGENT_PROMPT}</code>
      </pre>
    </div>
  );
}