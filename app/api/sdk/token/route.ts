import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Address } from "viem";

// Token exchange for the SDK code flow (M3): a confidential relying app
// redeems a single-use authorization code (plus PKCE verifier and client
// secret) for a short-lived signed student-status assertion.
//
// Ordering is load-bearing and deliberate — every check that can fail
// passes BEFORE the atomic consume, so a failing request never burns a
// legitimate code, and concurrent redemptions collapse to one winner:
//
//   body shape → rate limit → client lookup → client secret → code lookup
//   → client/redirect binding → expiry/used pre-check → PKCE verify
//   → fresh credential re-evaluation → ATOMIC consume → assertion.
//
// The consume itself is still conditional (usedAt IS NULL + unexpired), so
// a race lost between the pre-check and the write returns invalid_grant
// instead of minting a second assertion. Nothing here mints credentials,
// touches sessions/cookies, or accepts student identifiers from the caller:
// identity flows exclusively from the code record written at authorize time.
export async function POST(req: NextRequest) {
  const { sha256Hex, verifyClientSecret, verifyPkceS256 } = await import("@/lib/sdk-crypto");
  const { isClientIdFormat, matchRedirectUri } = await import("@/lib/sdk-validation");

  // Accept form-encoded (OAuth standard) or JSON bodies; values must be
  // strings — files or nested objects are rejected, never coerced.
  let body: Record<string, string>;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json: unknown = await req.json();
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      }
      body = {};
      for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
        if (typeof value !== "string") {
          return NextResponse.json({ error: "invalid_request" }, { status: 400 });
        }
        body[key] = value;
      }
    } else {
      const form = await req.formData();
      body = {};
      for (const [key, value] of form.entries()) {
        if (typeof value !== "string") {
          return NextResponse.json({ error: "invalid_request" }, { status: 400 });
        }
        body[key] = value;
      }
    }
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { grant_type: grantType, code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, client_secret: secret } = body;
  if (
    grantType !== "authorization_code" ||
    !isClientIdFormat(clientId) ||
    typeof code !== "string" ||
    code.length === 0 ||
    typeof redirectUri !== "string" ||
    redirectUri.length === 0 ||
    typeof verifier !== "string" ||
    verifier.length === 0 ||
    typeof secret !== "string" ||
    secret.length === 0
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Shared Valkey limiter, namespaced per presenting client id. Fail-closed
  // like the verify endpoint; rejected requests never reach the database.
  // (Keyed by the presented public id, so unknown-id spam still throttles
  // per key string rather than hitting the database unthrottled.)
  const { checkVerifyRateLimit } = await import("@/lib/verify-ratelimit");
  const { rateLimitExceededBody, rateLimitUnavailableBody } = await import("@/lib/verify-ratelimit-policy");
  const rate = await checkVerifyRateLimit(`sdk-token:${clientId}`);
  if (rate.outcome === "limited") {
    return NextResponse.json(rateLimitExceededBody(), {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSec), "Cache-Control": "no-store" },
    });
  }
  if (rate.outcome === "unavailable") {
    return NextResponse.json(rateLimitUnavailableBody(), {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { getSdkClientByClientId, getSdkUserWallet } = await import("@/lib/sdk-store");
  const client = await getSdkClientByClientId(clientId);
  // Same fixed response for unknown client and wrong secret: no oracle.
  if (!client) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }
  const { getSdkClientSecretHash } = await import("@/lib/sdk-store");
  if (!verifyClientSecret(secret, await getSdkClientSecretHash(client.id))) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }

  const { sdkCodeStore } = await import("@/lib/sdk-store");
  const { codeMatchesBinding } = await import("@/lib/sdk-codes");
  const record = await sdkCodeStore.getByHash(sha256Hex(code));
  if (
    !record ||
    !codeMatchesBinding(record, { clientDbId: client.id, redirectUri }) ||
    !matchRedirectUri(client.redirectUris, redirectUri)
  ) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  const nowMs = Date.now();
  if (record.usedAtMs !== null || nowMs >= record.expiresAtMs) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
  if (!verifyPkceS256(verifier, record.codeChallenge)) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  // Fresh credential re-evaluation against the authoritative on-chain
  // source — never the status captured in the earlier browser request.
  // A chain outage fails closed WITHOUT consuming the code (the student
  // simply retries the exchange), while revocation/expiry is reported
  // truthfully inside a validly-issued assertion below.
  const { hasValidCredential } = await import("@/lib/credential-contract");
  const wallet = await getSdkUserWallet(record.userId);
  if (!wallet) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
  let verified: boolean;
  try {
    verified = await hasValidCredential(wallet.address as Address);
  } catch {
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 502 });
  }

  // The single state-changing step: consume atomically. Zero matched rows
  // (replay, race lost, just expired) refuse without side effects.
  const consumed = await sdkCodeStore.redeemAtomic(sha256Hex(code), nowMs);
  if (!consumed) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  // Signing configuration stays server-side: loaded here, passed as
  // parameters, never logged or returned. Any misconfiguration (missing
  // private key, kid mismatch, bad previous JWK) fails loudly with a generic
  // 500 — never a partially-signed or unverifiable assertion.
  const { getAssertionSigningConfig } = await import("@/lib/sdk-keys");
  const { SdkCryptoError } = await import("@/lib/sdk-crypto");
  let signing;
  try {
    signing = getAssertionSigningConfig();
  } catch (error) {
    if (error instanceof SdkCryptoError) {
      console.error("[SDK] Token exchange misconfigured: assertion signing config invalid.");
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
    throw error;
  }
  const { buildAssertionV2, pairwiseSubject, SDK_ASSERTION_TTL_SEC } = await import("@/lib/sdk-crypto");
  const assertion = buildAssertionV2({
    privateKeyPem: signing.privateKeyPem,
    kid: signing.kid,
    iss: signing.issuer,
    sub: pairwiseSubject({ userId: record.userId, clientId, secret: signing.pairwiseSecret }),
    aud: clientId,
    verified,
    iatSec: Math.floor(nowMs / 1000),
  });
  console.log(`[SDK] Token issued for client ${client.id}`);
  return NextResponse.json(
    { assertion, expires_in: SDK_ASSERTION_TTL_SEC },
    { headers: { "Cache-Control": "no-store" } }
  );
}
