// Walletless Sign in with StudentProof — browser-safe entry.
//
// Flow (wallets never appear anywhere here):
//   1. Frontend builds an authorize URL (buildAuthorizeUrl) with a random
//      state and a PKCE S256 challenge, then redirects the student there.
//      No Google client of your own is needed — StudentProof owns Google OAuth.
//   2. The student signs in with Google on StudentProof, consents, and your
//      exact registered redirect_uri receives ?code=…&state=… (or
//      ?error=access_denied&state=… on denial).
//   3. YOUR SERVER calls exchangeAuthorizationCode (client secret + PKCE
//      verifier, never the browser) and then verifyStudentAssertion from
//      ./server.js against the provider JWKS. The result is a plain boolean:
//      { valid: true } means a currently-valid credential was confirmed;
//      anything else is a typed error — operational failures NEVER resolve
//      to false.
//
// SECURITY: clientSecret lives server-side only. State MUST be generated per
// login attempt and validated on callback (replay/CSRF protection); the
// verifier MUST be the exact string behind the challenge. This module keeps
// no session state — store pending { state, verifier } server-side yourself
// (signed httpOnly cookie or server store) with a short TTL.
export const DEFAULT_BASE_URL = "https://studentproof.app";
export const DEFAULT_TIMEOUT_MS = 10000;
// Builds the StudentProof authorize URL. Pure string assembly — throws on
// malformed inputs rather than producing a subtly wrong URL.
export function buildAuthorizeUrl(options) {
    const { clientId, redirectUri, state, codeChallenge } = options;
    if (typeof clientId !== "string" || clientId.length === 0)
        throw new StudentProofOAuthError("client_id is required.", { code: "invalid_option" });
    if (typeof redirectUri !== "string" || redirectUri.length === 0)
        throw new StudentProofOAuthError("redirect_uri is required.", { code: "invalid_option" });
    if (typeof state !== "string" || state.length === 0 || state.length > 500)
        throw new StudentProofOAuthError("state must be 1–500 chars.", { code: "invalid_option" });
    if (typeof codeChallenge !== "string" || codeChallenge.length === 0)
        throw new StudentProofOAuthError("code_challenge is required.", { code: "invalid_option" });
    const mode = options.mode ?? "signin";
    if (mode !== "signin" && mode !== "signup")
        throw new StudentProofOAuthError("mode must be signin or signup.", { code: "invalid_option" });
    const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        mode,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
    });
    return `${base}/sdk/connect?${query.toString()}`;
}
function webCrypto() {
    const cryptoObj = globalThis.crypto;
    if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function" || typeof cryptoObj.subtle?.digest !== "function") {
        throw new StudentProofOAuthError("WebCrypto (getRandomValues + subtle.digest) is required.", { code: "missing_webcrypto" });
    }
    return cryptoObj;
}
function base64Url(bytes) {
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    // btoa is available in browsers and Node 18+.
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Per-attempt random state (CSRF protection). Store it server-side alongside
// the verifier and require an exact match on callback.
export function generateState() {
    return base64Url(webCrypto().getRandomValues(new Uint8Array(16)));
}
// PKCE S256 pair: challenge = BASE64URL(SHA256(ascii_verifier)). Follows the
// provider's verifier alphabet/length rules (43–128 chars).
export async function createPkcePair() {
    const verifier = base64Url(webCrypto().getRandomValues(new Uint8Array(32)));
    const digest = await webCrypto().subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}
export class StudentProofOAuthError extends Error {
    constructor(message, opts = {}) {
        super(message);
        this.name = "StudentProofOAuthError";
        this.status = opts.status ?? null;
        this.code = opts.code ?? "request_failed";
    }
}
export class InvalidClientError extends StudentProofOAuthError {
    constructor() {
        super("Invalid client_id or client_secret (HTTP 401).", { status: 401, code: "invalid_client" });
        this.name = "InvalidClientError";
    }
}
export class InvalidGrantError extends StudentProofOAuthError {
    constructor() {
        super("Authorization code rejected: unknown, expired, replayed, unbound, or PKCE mismatch (HTTP 400).", { status: 400, code: "invalid_grant" });
        this.name = "InvalidGrantError";
    }
}
export class InvalidRequestError extends StudentProofOAuthError {
    constructor() {
        super("Malformed token request (HTTP 400).", { status: 400, code: "invalid_request" });
        this.name = "InvalidRequestError";
    }
}
export class RateLimitedError extends StudentProofOAuthError {
    constructor(retryAfterSec) {
        super("StudentProof rate limit exceeded (HTTP 429). Back off and retry.", { status: 429, code: "rate_limited" });
        this.name = "RateLimitedError";
        this.retryAfterSec = retryAfterSec;
    }
}
// Fail-closed signal: the verification outcome is UNKNOWN (chain/RPC outage,
// JWKS unreachable, timeout, network failure). Callers must NOT treat this
// as unverified-and-grant or as { valid: false } — deny the gated action or
// retry later.
export class VerificationUnavailableError extends StudentProofOAuthError {
    constructor(status = null) {
        super("StudentProof verification unavailable — fail closed, do not grant access.", { status, code: "verification_unavailable" });
        this.name = "VerificationUnavailableError";
    }
}
export class InvalidAssertionError extends StudentProofOAuthError {
    constructor() {
        super("Assertion rejected: bad shape, signature, issuer, audience, or lifetime.", { code: "invalid_assertion" });
        this.name = "InvalidAssertionError";
    }
}
function parseRetryAfter(value) {
    if (!value)
        return null;
    const secs = Number.parseInt(value, 10);
    return Number.isFinite(secs) && secs > 0 ? secs : null;
}
// Server-side code redemption. Every failure mode throws a typed error;
// success is the raw assertion for verifyStudentAssertion (see server.js) —
// never a boolean, so callers cannot mistake transport success for verified
// status.
export async function exchangeAuthorizationCode(options) {
    const { code, redirectUri, clientId, clientSecret, codeVerifier } = options;
    if (!code || !redirectUri || !clientId || !clientSecret || !codeVerifier) {
        throw new InvalidRequestError();
    }
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
        res = await fetchImpl(`${base}/api/sdk/token`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-store" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: redirectUri,
                client_id: clientId,
                client_secret: clientSecret,
                code_verifier: codeVerifier,
            }),
            signal: controller.signal,
        });
    }
    catch (error) {
        if (error instanceof Error && error.name === "AbortError")
            throw new VerificationUnavailableError();
        throw new VerificationUnavailableError();
    }
    finally {
        clearTimeout(timer);
    }
    if (res.status === 401)
        throw new InvalidClientError();
    if (res.status === 400) {
        const probe = await res.json().catch(() => ({}));
        if (probe.error === "invalid_request")
            throw new InvalidRequestError();
        throw new InvalidGrantError();
    }
    if (res.status === 429) {
        throw new RateLimitedError(typeof res.headers?.get === "function" ? parseRetryAfter(res.headers.get("Retry-After")) : null);
    }
    if (!res.ok)
        throw new VerificationUnavailableError(res.status);
    let body;
    try {
        body = await res.json();
    }
    catch {
        throw new VerificationUnavailableError(res.status);
    }
    if (!body || typeof body !== "object")
        throw new VerificationUnavailableError(res.status);
    const { assertion, expires_in } = body;
    if (typeof assertion !== "string" || assertion.length === 0 || typeof expires_in !== "number") {
        throw new VerificationUnavailableError(res.status);
    }
    return { assertion, expiresIn: expires_in };
}
//# sourceMappingURL=index.js.map