import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAddress } from "viem";
import type { Address } from "viem";
import { isZeroAddress, safeChainErrorLog, verifyErrorBody, verifySuccessBody } from "@/lib/verify-request";

// Read-only credential check for businesses that have signed up for API
// access (see /sdk's "Get API Access" button) — gated by an API key, not a login session.
// Any third-party app calls this directly (curl, fetch, server-to-server)
// with no install. Only ever reads on-chain state via hasValidCredential();
// never touches student data beyond the boolean result.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json(
      verifyErrorBody("Missing API key. Include it as the 'x-api-key' header — get one at /sdk."),
      { status: 401, headers: CORS_HEADERS }
    );
  }

  const { authenticateApiKey, logApiUsage } = await import("@/lib/business-db");
  const business = await authenticateApiKey(apiKey);
  if (!business) {
    return NextResponse.json(verifyErrorBody("Invalid API key."), { status: 401, headers: CORS_HEADERS });
  }

  // Shared rate limiting (60/min per business id) runs here: after auth so
  // the stable business id — never the raw key — identifies the caller, and
  // before any validation or chain call so rejected requests cost nothing.
  // See lib/verify-ratelimit.ts; route-handler behavior itself has no
  // harness, so this wiring is review-verified, not test-executed.
  const { checkVerifyRateLimit } = await import("@/lib/verify-ratelimit");
  const { rateLimitExceededBody, rateLimitUnavailableBody } = await import("@/lib/verify-ratelimit-policy");
  const rate = await checkVerifyRateLimit(business.id);
  if (rate.outcome === "limited") {
    return NextResponse.json(rateLimitExceededBody(), {
      status: 429,
      headers: { ...CORS_HEADERS, "Retry-After": String(rate.retryAfterSec), "Cache-Control": "no-store" },
    });
  }
  if (rate.outcome === "unavailable") {
    // Fail closed: store misconfigured or unreachable. No chain call.
    return NextResponse.json(rateLimitUnavailableBody(), {
      status: 503,
      headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
    });
  }
  // `allowed` and explicit local-dev `bypass_dev` both fall through.

  const wallet = req.nextUrl.searchParams.get("wallet");

  // The zero address passes format checks but reverts on-chain (OZ
  // balanceOf rejects address(0)), so reject it here as client input.
  if (!wallet || !isAddress(wallet, { strict: false }) || isZeroAddress(wallet)) {
    return NextResponse.json(
      verifyErrorBody("Query param 'wallet' must be a valid EVM address, e.g. /api/verify?wallet=0x..."),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { hasValidCredential } = await import("@/lib/credential-contract");

  try {
    const valid = await hasValidCredential(wallet as Address);

    // Never let a logging failure break the actual response it's logging.
    // Redacted like chain errors: Prisma failures can embed the DB host.
    logApiUsage(business.id, business.apiKeyId).catch((error) =>
      console.error("[Verify] Failed to log API usage:", safeChainErrorLog(error))
    );

    return NextResponse.json(
      verifySuccessBody(valid),
      // Credential status can change (mint/expiry/revocation) at any time —
      // never let a browser or CDN cache a stale answer.
      { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
    );
  } catch (error) {
    // Log a redacted one-liner: raw viem/RPC errors can embed RPC URLs.
    console.error("[Verify] hasValidCredential call failed:", safeChainErrorLog(error));
    return NextResponse.json(verifyErrorBody("Failed to read credential status"), {
      status: 502,
      headers: CORS_HEADERS,
    });
  }
}
