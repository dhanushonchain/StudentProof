# @studentproof/sdk

Walletless **Sign in with StudentProof**: authorize-URL builders, server-side
code exchange, and Ed25519 assertion verification. No Google client of your
own, no wallet addresses, no blockchain libraries. Node 18+; URL builders
also run in browsers. Zero dependencies.

**Published package: `@studentproof/sdk`** on npm. Install with:

```bash
npm install @studentproof/sdk
```

## What it does

Gives your website a verified-student boolean through StudentProof's hosted
flow: the student signs in with Google **on StudentProof**, StudentProof maps
that Google identity to its own account internally, checks the credential
live, and your server verifies a signed assertion. Your app learns `{ valid:
true | false }` plus an opaque pairwise subject — never an email, wallet,
proof, or Google token.

Google sign-in **identifies** the user; only the live credential check
**determines** student status. Signing in with Google alone proves nothing.

## Install

```bash
npm install @studentproof/sdk
```

Source is also available in this repo at `packages/studentproof-oauth`. To vendor it:

```bash
cp -r packages/studentproof-oauth /path/to/your-app/vendor/
npm run build  # emits dist/ + dist/*.d.ts
```

## Usage

**1. Register.** In the StudentProof developer dashboard, register your app
with its **exact** callback URL (byte-for-byte; `https` in production,
`http://localhost:*` for local dev). You receive a `client_id` and a client
secret. The secret lives **server-side only** — never in frontend code.

**2. Button → authorize URL (frontend).** No React component is shipped (to
stay dependency-free); this 10-line snippet is the button:

```tsx
import { buildAuthorizeUrl, createPkcePair, generateState } from "@studentproof/sdk";

async function startLogin() {
  const state = generateState();
  const { verifier, challenge } = await createPkcePair();
  // POST { state, verifier } to YOUR server first (signed httpOnly cookie
  // or server store, 10-minute TTL), then:
  window.location.href = buildAuthorizeUrl({
    baseUrl: "https://studentproof.app",
    clientId: "YOUR_CLIENT_ID",
    redirectUri: "https://yourapp.com/auth/callback",
    state,
    codeChallenge: challenge,
  });
}
// <button onClick={startLogin}>Sign in with StudentProof</button>
```

You need no Google OAuth client ID or secret — StudentProof owns Google OAuth.

**3. Callback (your server).** The provider redirects to your exact
`redirect_uri` with `?code=…&state=…` (or `?error=access_denied&state=…` on
denial — grant nothing). Validate `state` against your stored pending login
(exact match, single-use, unexpired), then:

```ts
import { exchangeAuthorizationCode } from "@studentproof/sdk";
import { verifyStudentAssertion } from "@studentproof/sdk/server";

const { assertion } = await exchangeAuthorizationCode({
  baseUrl: "https://studentproof.app",
  code,
  redirectUri: "https://yourapp.com/auth/callback",
  clientId: "YOUR_CLIENT_ID",
  clientSecret: process.env.STUDENTPROOF_CLIENT_SECRET!, // server env only
  codeVerifier: stored.verifier,
});
const { valid } = await verifyStudentAssertion({
  baseUrl: "https://studentproof.app",
  assertion,
  expectedAud: "YOUR_CLIENT_ID", // assertions for anyone else are rejected
  expectedIss: "https://studentproof.app",
});
handleResult({ valid }); // true = currently-valid credential confirmed
```

## Errors (fail closed)

| Case | Outcome |
|---|---|
| Valid assertion, `vb: true` | `{ valid: true }` |
| Valid assertion, `vb: false` | `{ valid: false }` (account has no live credential) |
| 401 bad client/secret | `InvalidClientError` |
| 400 bad code/binding/PKCE | `InvalidGrantError` (replay, expiry, wrong verifier) |
| 429 | `RateLimitedError` (with `retryAfterSec`) |
| 502/503, JWKS outage, timeout, network failure, bad signature/audience/issuer/expiry | `VerificationUnavailableError` or `InvalidAssertionError` — **never `{ valid: false }`** |

Only a returned `{ valid: true }` proves student status. Deny the gated
action (or retry later) on every error path.

## Local development setup

1. Run the isolated StudentProof app (see repo README) and the demo in
   `~/demo-sdk-sp` (needs a provisioned `SdkClient` row — see
   `scripts/provision-sdk-demo-client.mjs`).
2. Register `http://localhost:3117/auth/callback` (or your port) as the
   client's exact redirect URI; use `http://localhost:3000` (or yours) as
   `baseUrl` and `expectedIss`.
3. Keep `clientSecret` in server env (`STUDENTPROOF_CLIENT_SECRET`), never in
   the browser bundle — grep your client output for `sp_sk_` before shipping.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `invalid_client` (401) | wrong secret or unknown `client_id` |
| `invalid_grant` (400) | reused/expired code, wrong `redirect_uri`, wrong PKCE verifier |
| `invalid_assertion` | tampered assertion, wrong `expectedAud`/`expectedIss`, clock skew, rotated keys (JWKS is re-read once per verification) |
| `verification_unavailable` | provider/RPC/JWKS outage or timeout — retry later, grant nothing |
| Login loops back to sign-in | callback `state` mismatch — your pending-login store isn't round-tripping |
