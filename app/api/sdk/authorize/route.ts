import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Address } from "viem";

// Consent decision handler for the SDK code flow (M2). Creates single-use
// authorization codes on allow, redirects access_denied on deny. Creates no
// credentials and performs no mints — issuance stays exclusively inside the
// existing verification lifecycle.
//
// Every parameter is re-validated server-side (the consent form's hidden
// fields are client-tamperable by design): unknown clients and unregistered
// redirect URIs get JSON errors, never redirects. Only an explicitly denied,
// fully-validated request redirects to the third party — with a fixed error
// code and the echoed state, nothing else.
export async function POST(req: NextRequest) {
  const session = await auth();

  let form: Record<string, string>;
  try {
    const data = await req.formData();
    form = {};
    for (const [key, value] of data.entries()) {
      if (typeof value !== "string") {
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      }
      form[key] = value;
    }
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { parseSdkFlowParams, assertAuthorizeRequest, SdkRequestError } = await import("@/lib/sdk-validation");
  const { buildCodeRedirectUri, buildErrorRedirectUri, requireStudentSession, resolveCredentialGate } = await import(
    "@/lib/sdk-validation"
  );

  // Cross-site POST hardening (defense in depth behind the SameSite session
  // cookie): the consent form is same-origin by design, so a present Origin
  // header naming any other origin is rejected. An absent Origin (older
  // clients) still falls back to the cookie defense, which is documented.
  const origin = req.headers.get("origin");
  if (origin) {
    let originOk = false;
    try {
      originOk = new URL(origin).origin === req.nextUrl.origin;
    } catch {
      originOk = false;
    }
    if (!originOk) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
  }

  let params;
  try {
    params = parseSdkFlowParams(form);
  } catch (error) {
    const code = error instanceof SdkRequestError ? error.message : "invalid_request";
    return NextResponse.json({ error: code }, { status: 400 });
  }

  const { getSdkClientByClientId, findSdkUserByWallet, issueSdkCode } = await import("@/lib/sdk-store");
  const client = await getSdkClientByClientId(params.clientId);
  if (!client) {
    return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  }

  // Student/business separation: only a student session (wallet, no
  // business id) may authorize student-status sharing.
  let walletPublicKey: string;
  try {
    ({ walletPublicKey } = requireStudentSession(
      session?.user && typeof session.user === "object" ? session.user : null
    ));
  } catch (error) {
    const code = error instanceof SdkRequestError ? error.message : "login_required";
    const status = code === "wrong_account_type" ? 403 : 401;
    return NextResponse.json({ error: code }, { status });
  }

  // Full gate on the registered allowlist. Anything failing here cannot be
  // redirected anywhere safe — JSON error, same as the authorize page.
  try {
    assertAuthorizeRequest({
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      state: params.state,
      registeredUris: client.redirectUris,
      env: process.env.NODE_ENV === "production" ? "production" : "development",
    });
  } catch (error) {
    const code = error instanceof SdkRequestError ? error.message : "invalid_request";
    return NextResponse.json({ error: code }, { status: 400 });
  }

  // Shared Valkey limiter, namespaced per relying client. Fail-closed like
  // the verify endpoint; rejected requests never reach the chain.
  const { checkVerifyRateLimit } = await import("@/lib/verify-ratelimit");
  const { rateLimitExceededBody, rateLimitUnavailableBody } = await import("@/lib/verify-ratelimit-policy");
  const rate = await checkVerifyRateLimit(`sdk-authz:${client.id}`);
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

  const decision = form["decision"];
  if (decision !== "allow" && decision !== "deny") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Explicit denial returns to the exact registered URI with a fixed error
  // and the original state — the only redirect this route ever makes to a
  // third party, and only for a fully-validated request. Status 303 (not the
  // NextResponse default 307): this endpoint answers a form POST, and a 307
  // would make the browser repeat the POST at the target instead of issuing
  // the GET every relying party (and OAuth 2.0 §4.1.2) expects.
  if (decision === "deny") {
    return NextResponse.redirect(buildErrorRedirectUri({ redirectUri: params.redirectUri, error: "access_denied", state: params.state }), 303);
  }

  // Authoritative credential gate (same source as the public verify
  // endpoint). Anything but a currently-valid credential bounces back to
  // our own authorize page — never to the app, since nothing was consented
  // and there is no status to report. The redirect target is absolute:
  // NextResponse.redirect throws on relative URLs, which previously turned
  // this bounce into a 502 for every unverified student clicking Allow.
  // Status 303 (see above): the target is a GET page, never a POST repeat.
  const bounceBack = () => {
    const back = new URLSearchParams({
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      state: params.state,
      mode: params.mode,
      code_challenge: params.codeChallenge,
      code_challenge_method: "S256",
      error: "verification_required",
    });
    return NextResponse.redirect(new URL(`/sdk/authorize?${back.toString()}`, req.nextUrl.origin), 303);
  };

  const { hasValidCredential } = await import("@/lib/credential-contract");
  const owner = await findSdkUserByWallet(walletPublicKey);
  if (!owner) return bounceBack();
  try {
    if (resolveCredentialGate({ hasValidCredential: await hasValidCredential(walletPublicKey as Address) }) !== "proceed") {
      return bounceBack();
    }
  } catch {
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 502 });
  }

  // Issue the single-use code: raw value travels once in the redirect below;
  // only its hash is persisted (see issueSdkCode). No mint, no session data.
  const { record, code } = await issueSdkCode({
    userId: owner.id,
    clientDbId: client.id,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
  });
  console.log(`[SDK] Code issued for client ${client.id} record ${record.id}`);
  // Status 303 (see above): the relying party's callback is a GET endpoint.
  // A 307 here replays the consent POST at the callback URL, which every
  // correct relying party rejects — this exact failure broke real-browser
  // Allow flows while scripted tests (manual redirect handling) passed.
  return NextResponse.redirect(buildCodeRedirectUri({ redirectUri: params.redirectUri, code, state: params.state }), 303);
}
