// Pure SDK v1 client/redirect validation. Zero imports — safe to unit-test.
//
// Rules (frozen for v1):
// - redirect_uri must match a registered entry byte-for-byte after trimming
//   ASCII whitespace. No prefix matching, no wildcards, no case folding —
//   any of those would widen an allowlist into an open redirect.
// - Production additionally requires https:. Local development additionally
//   permits http://localhost[:port]/ (loopback only, never LAN names or IPs).
// - clientId format is enforced so malformed identifiers fail before any DB
//   lookup (no existence oracle timing differences to exploit, and no junk
//   reaching the database layer).
export function isClientIdFormat(value: unknown): value is string {
  return typeof value === "string" && /^sp_client_[A-Za-z0-9_-]{16,64}$/.test(value);
}

export function matchRedirectUri(registered: string[], requested: unknown): boolean {
  if (typeof requested !== "string") return false;
  const candidate = requested.trim();
  if (candidate.length === 0 || candidate.length > 2000) return false;
  return registered.some((entry) => typeof entry === "string" && entry === candidate);
}

export type RedirectEnv = "production" | "development";

export function isRedirectSchemeAllowed(uri: string, env: RedirectEnv): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (env === "development" && parsed.protocol === "http:" && parsed.hostname === "localhost") return true;
  return false;
}

export class SdkRequestError extends Error {}

// Query/form parameters shared by /sdk/connect, /sdk/authorize, and the
// authorize POST route. code_challenge_method must be exactly S256 —
// PKCE is mandatory in v1, and the S256 proof itself is checked at
// redemption (M3) against the stored challenge.
export type SdkFlowMode = "signin" | "signup";

export type SdkFlowParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  mode: SdkFlowMode;
  codeChallenge: string;
};

function firstString(value: string | string[] | undefined | null): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

// Validates shape only (no database): every field present and well-formed.
// Callers then resolve the client row and re-check the redirect against the
// registered allowlist via assertAuthorizeRequest.
export function parseSdkFlowParams(query: Record<string, string | string[] | undefined>): SdkFlowParams {
  const clientId = firstString(query.client_id);
  if (!isClientIdFormat(clientId)) throw new SdkRequestError("invalid_client");
  const redirectUri = firstString(query.redirect_uri);
  if (typeof redirectUri !== "string" || redirectUri.length === 0) throw new SdkRequestError("invalid_redirect");
  const state = firstString(query.state);
  if (typeof state !== "string" || state.length === 0 || state.length > 500) {
    throw new SdkRequestError("invalid_state");
  }
  const mode = firstString(query.mode);
  if (mode !== "signin" && mode !== "signup") throw new SdkRequestError("invalid_request");
  const codeChallenge = firstString(query.code_challenge);
  const codeChallengeMethod = firstString(query.code_challenge_method);
  if (typeof codeChallenge !== "string" || codeChallenge.length === 0 || codeChallengeMethod !== "S256") {
    throw new SdkRequestError("invalid_request");
  }
  return { clientId: clientId as string, redirectUri, state, mode, codeChallenge };
}

// Error codes ever sent to a relying app via redirect. Fixed set, no
// details — the app learns an outcome class, never a reason with data.
export type SdkRedirectError = "access_denied" | "verification_required" | "invalid_request";

// Builds the success redirect: exact registered URI + raw code + echoed
// state (URL-encoded; state was length-validated at authorize time).
export function buildCodeRedirectUri(args: { redirectUri: string; code: string; state: string }): string {
  return `${args.redirectUri}?code=${encodeURIComponent(args.code)}&state=${encodeURIComponent(args.state)}`;
}

export function buildErrorRedirectUri(args: {
  redirectUri: string;
  error: SdkRedirectError;
  state: string;
}): string {
  return `${args.redirectUri}?error=${args.error}&state=${encodeURIComponent(args.state)}`;
}

// Minimal session shape M2 needs. Identity is resolved ONLY from our own
// authenticated session (googleSub→User via wallet) — never from a
// third-party-supplied email, wallet, or identifier.
export type SdkSessionUser = {
  walletPublicKey?: unknown;
  businessId?: unknown;
} | null;

// Display-only email for the "Continue with verified email" card. The
// returned address must NEVER be used for identity resolution, account
// lookup, or impersonation checks: it is Google-supplied profile text, and
// duplicate or unverified emails across Google accounts are expected.
// Identity stays anchored on googleSub (see auth.ts); this helper only
// decides what the UI may truthfully print.
export type SdkEmailDisplay = { email: string; verified: boolean } | null;

export function resolveEmailDisplay(
  sessionUser: { email?: unknown; googleEmailVerified?: unknown } | null | undefined
): SdkEmailDisplay {
  if (!sessionUser || typeof sessionUser !== "object") return null;
  const { email, googleEmailVerified } = sessionUser;
  if (typeof email !== "string") return null;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 320) return null;
  return { email: trimmed, verified: googleEmailVerified === true };
}

// Enforces student/business separation: business sessions (API-key flow)
// must never authorize student-status sharing, and anonymous callers must
// log in first. Throws SdkRequestError with a safe code.
export function requireStudentSession(sessionUser: SdkSessionUser): { walletPublicKey: string } {
  if (!sessionUser || typeof sessionUser !== "object") throw new SdkRequestError("login_required");
  if (typeof sessionUser.businessId === "string" && sessionUser.businessId.length > 0) {
    throw new SdkRequestError("wrong_account_type");
  }
  if (typeof sessionUser.walletPublicKey !== "string" || sessionUser.walletPublicKey.length === 0) {
    throw new SdkRequestError("login_required");
  }
  return { walletPublicKey: sessionUser.walletPublicKey };
}

// Signin/signup gate evaluated from the authoritative on-chain check (see
// hasValidCredential). Anything but a currently-valid credential refuses
// code issuance — M2 never reports verified status for pending, failed,
// expired, or invalid credentials. The caller renders/redirects a safe
// verification_required outcome; no reason details leave the server.
export function resolveCredentialGate(args: { hasValidCredential: boolean }): "proceed" | "verification_required" {
  return args.hasValidCredential ? "proceed" : "verification_required";
}
// Full authorize-request gate used by M2 endpoints: shape, client format,
// exact allowlist match, and scheme policy. Throws SdkRequestError with a
// fixed safe code — never the URI, client id, or secrets.
export function assertAuthorizeRequest(args: {
  clientId: unknown;
  redirectUri: unknown;
  state: unknown;
  registeredUris: string[];
  env: RedirectEnv;
}): { clientId: string; redirectUri: string; state: string } {
  if (!isClientIdFormat(args.clientId)) throw new SdkRequestError("invalid_client");
  if (typeof args.redirectUri !== "string") throw new SdkRequestError("invalid_redirect");
  const redirectUri = args.redirectUri.trim();
  if (!matchRedirectUri(args.registeredUris, redirectUri)) throw new SdkRequestError("invalid_redirect");
  if (!isRedirectSchemeAllowed(redirectUri, args.env)) throw new SdkRequestError("invalid_redirect");
  if (typeof args.state !== "string" || args.state.length === 0 || args.state.length > 500) {
    throw new SdkRequestError("invalid_state");
  }
  return { clientId: args.clientId, redirectUri, state: args.state };
}
