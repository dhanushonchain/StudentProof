# @studentproof/verify

Typed, dependency-free client for StudentProof's wallet verification API
(`GET /api/verify?wallet=0x...`). Node 18+ and browsers (global `fetch`).
Zero dependencies.

> **Not published to npm.** Install from source until a release is cut
> (see below). Do not claim otherwise in downstream docs.

## What it does

Answers one question: does a supplied wallet address hold an active,
non-expired StudentProof credential? It does **not** provide walletless
student login — your app supplies the wallet address.

## Install (source only, for now)

```bash
# from the studentproof repo
cp -r packages/studentproof-verify /path/to/your-app/vendor/
# then import from ./vendor/studentproof-verify/src/index.ts,
# or build first: npm run build  (emits dist/ + dist/index.d.ts)
```

Release checklist (requires explicit approval — do not run unprompted):

1. Remove `"private": true`, pick a license, bump `version`.
2. `npm run build` — must emit `dist/index.js` + `dist/index.d.ts` cleanly.
3. `node --test src/index.test.ts` — all green, no network.
4. `npm publish --access public` (scoped package).

## Usage (server-side only)

```ts
import { StudentProofClient } from "./vendor/studentproof-verify/src/index.ts";

const client = new StudentProofClient({ apiKey: process.env.STUDENTPROOF_API_KEY! });
const valid = await client.verifyWallet("0x...");
if (valid) {
  // wallet holds an active credential
}
```

**Never expose your API key in browser-side code.** Call this client from
your server (or proxy through it) and keep the key in an environment
variable. Anyone who can read the key can verify — and meter usage — as you.

## Errors (fail closed)

| Case | Thrown |
|---|---|
| `200 { valid: true/false }` | returns the boolean |
| 401 | `InvalidApiKeyError` |
| 400 (also client-side for malformed/zero addresses, before any fetch) | `InvalidWalletError` |
| 429 (carries `retryAfterSec` from `Retry-After`) | `RateLimitedError` |
| 5xx, network failure, malformed body | `VerificationUnavailableError` — deny the gated action or retry later |
| timeout (default 10s, configurable via `timeoutMs`) | `VerifyTimeoutError` |

Only a returned `true` is proof of student status. A `false` and an error
are different outcomes: never grant a gated action on any error path.

## Options

```ts
new StudentProofClient({
  apiKey: "...",          // required, sent as x-api-key
  baseUrl: "https://studentproof.app", // optional (default shown)
  timeoutMs: 10_000,      // optional per-request timeout
  fetchImpl: fetch,       // optional custom fetch (testing, proxies)
});
```

One-shot form: `verifyWallet(address, { apiKey })`.
