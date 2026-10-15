"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const CREAM = "#E1E0CC";

const AGENT_PROMPT = `# StudentProof SDK Integration

Integrate StudentProof's AI-assisted student-status verification into the user's existing application using the official @studentproof/sdk package. The goal is to let applications verify student eligibility through a valid StudentProof credential without building their own institutional verification infrastructure.

## Step 1: Ask the user to choose an integration method

**Before inspecting or modifying code, ask the user which integration method they want. Do not begin implementation until they choose.**

Present these options clearly:

### Option A — Wallet-Based Verification
Check whether an existing wallet address holds a valid StudentProof credential.

- Requires a student's wallet address.
- Uses a StudentProof API key (sp_live_...).
- Best for applications that already support wallet connections.
- Does not require StudentProof OAuth sign-in.

### Option B — Walletless Sign-In with StudentProof
Let users sign in through StudentProof without connecting a wallet.

- Uses the StudentProof OAuth authorization-code flow with PKCE.
- Requires an OAuth Client ID (sp_client_...) and Client Secret (sp_sk_...).
- StudentProof handles its supported authentication and institutional verification flow.
- Best for applications that want a dedicated student sign-in experience.

### Option C — Both Methods
Implement wallet-based verification and walletless sign-in, keeping their credentials, routes, and verification logic separate.

Ask:

"Which StudentProof integration would you like to implement?"

1. Wallet-Based Verification
2. Walletless Sign-In with StudentProof
3. Both methods

## Step 2: Inspect the existing project

After the user chooses, inspect the existing codebase before making changes.

Identify:
- Framework, language, and project structure.
- Existing authentication and session management.
- Existing API routes, middleware, and authorization checks.
- Package manager and current dependencies.
- Existing environment-variable conventions.
- Existing StudentProof integration, if any.

Adapt the implementation to the existing architecture. Reuse appropriate existing components and avoid unnecessary dependencies, duplicate routes, or unrelated changes.

Do not replace the application's authentication system or rewrite unrelated functionality.

## Step 3: Install the SDK and configure credentials

Install the official package:


   npm install @studentproof/sdk
   # or
   yarn add @studentproof/sdk


Developer credentials are available from the StudentProof dashboard (https://studentproof.app/sdk) after signing in with Google.

Depending on the selected method, configure:
- **API key:** sp_live_... for wallet-based verification.
- **OAuth Client ID:** sp_client_... for identifying the registered application.
- **OAuth Client Secret:** sp_sk_... for server‑side OAuth code exchange.

Use the project's existing environment‑variable conventions. Never hardcode real credentials, expose secrets in browser code, or commit secrets to source control.

## Option A: Wallet-Based Verification

### Implementation

Perform verification on the backend, not directly in browser code.


const response = await fetch(
     'https://studentproof.app/api/verify?wallet=' + encodeURIComponent(walletAddress),
  {
    method: "GET",
    headers: {
      "x-api-key": process.env.STUDENTPROOF_API_KEY!,
      "Cache-Control": "no-store",
    },
    signal: AbortSignal.timeout(10_000),
  }
);

if (!response.ok) {
  throw new Error("Student verification unavailable");
}

const result = (await response.json()) as { valid: boolean };

if (result.valid !== true) {
  throw new Error("A valid student credential is required");
}

// Grant access only after valid === true.


### Expected behavior

- 'valid: true' – active, non‑expired credential present.
- 'valid: false' – no credential.
- '400' – malformed wallet address.
- '401' – invalid or revoked API key.
- '429' – rate‑limited.
- '502'/'503' – verification service unavailable.
- Network timeout – treat as verification unavailable.

Never cache the verification response ('Cache-Control: no-store').

## Option B: Walletless Sign‑In with StudentProof

### Step 1: Start authorization


import { buildAuthorizeUrl, generateState, createPkcePair } from "@studentproof/sdk";

const state = generateState();
const { verifier, challenge } = await createPkcePair();

const authUrl = buildAuthorizeUrl({
  clientId: process.env.NEXT_PUBLIC_STUDENTPROOF_CLIENT_ID!,
  redirectUri: "https://yourapp.com/api/auth/callback",
  state,
  codeChallenge: challenge,
  mode: "signin",
});

window.location.href = authUrl;


### Step 2: Handle the callback


import { exchangeAuthorizationCode } from "@studentproof/sdk";

const { assertion } = await exchangeAuthorizationCode({
  code,
  redirectUri: "https://yourapp.com/api/auth/callback",
  clientId: process.env.STUDENTPROOF_CLIENT_ID!,
  clientSecret: process.env.STUDENTPROOF_CLIENT_SECRET!,
  codeVerifier: storedVerifier,
});


### Step 3: Verify the assertion


import { verifyStudentAssertion } from "@studentproof/sdk/server";

const { valid, sub } = await verifyStudentAssertion({
  assertion,
  expectedAud: process.env.STUDENTPROOF_CLIENT_ID!,
  expectedIss: "https://studentproof.app",
});

if (valid !== true) {
  throw new Error("Student verification failed");
}

// Grant access – 'sub' is a stable per‑app student identifier.


## Step 4: Security requirements

- Keep secrets server‑side only.
- Validate OAuth state and PKCE verifier.
- Use PKCE S256.
- Fail closed on any error.
- No caching of wallet verification.
- Verify assertions against the JWKS endpoint (https://studentproof.app/api/sdk/jwks).

## Step 5: Testing requirements

### Wallet‑Based tests
- Valid wallet with credential.
- Valid wallet without credential.
- Malformed wallet.
- Invalid/revoked API key.
- Rate‑limit handling.
- Service errors.

### OAuth tests
- Successful flow.
- Missing/mismatched state.
- Invalid PKCE verifier.
- Expired/used code.
- Invalid assertion signature.
- JWKS verification failures.
- Ensure failures never grant access.

## Step 6: Implementation checklist

- [ ] User chose integration method.
- [ ] Project inspected.
- [ ] SDK installed.
- [ ] Credentials stored securely.
- [ ] Server‑client boundaries enforced.
- [ ] OAuth state & PKCE handled.
- [ ] Verification logic implemented.
- [ ] All failure paths deny access.
- [ ] Tests pass.
- [ ] No unrelated changes made.
- [ ] Documentation updated.

Do not claim production readiness until the selected integration is fully tested and verified.
`;

export default function AgentIntegrationPrompt() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(AGENT_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: CREAM }}>
            # StudentProof SDK Integration
          </h2>
          <p className="mt-1 text-sm leading-6" style={{ color: `${CREAM}85` }}>
            Copy this prompt and paste it into Cursor, Claude Code, or any other AI coding agent to generate a StudentProof integration in your codebase.
          </p>
          <p className="mt-1 text-sm leading-6" style={{ color: `${CREAM}85` }}>
            It covers both the wallet verification API and the walletless OAuth sign-in flow.
          </p>
        </div>
        <button type="button" onClick={handleCopy} className="shrink-0 rounded-xl border px-4 py-2.5 text-xs font-medium transition hover:opacity-80" style={{ borderColor: `${CREAM}30`, color: CREAM }}>
          <div className="flex items-center gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy prompt"}
          </div>
        </button>
      </div>
      <pre className="max-h-96 overflow-y-auto rounded-xl p-4 text-xs leading-5" style={{ background: "#09090B", border: `1px solid ${CREAM}20`, color: `${CREAM}80` }}>
        <code>{AGENT_PROMPT}</code>
      </pre>
    </div>
  );
}
