// Pure credential-issuance policy: lifecycle states, error classification,
// retry eligibility, and backoff. Zero imports — safe to unit-test anywhere.
//
// Lifecycle (persisted on VerificationRecord, separate from the `status`
// proof-verification column):
//   not_started -> pending -> issued
//                        \-> failed -> pending (retry) -> issued
//                                        \-> failed (attempts exhausted)
// `pending` covers both "attempt in flight" and "awaiting (re)try";
// cross-instance safety comes from the atomic claim in the orchestrator
// (optimistic concurrency on issuanceAttempts), never from this module.

// Must match the Prisma schema comment on VerificationRecord.issuanceStatus.
export type IssuanceStatus = "not_started" | "pending" | "issued" | "failed";

// Stable, secret-free error categories. Only the category string is ever
// persisted (lastIssuanceError) or mapped to UI copy — raw RPC messages,
// URLs, keys, and stack traces must never leave the server log.
export type IssuanceErrorCategory =
  | "rpc_timeout" // transport/RPC failure or timeout; broadcast may still have landed
  | "tx_reverted" // transaction confirmed-reverted; no state change on chain
  | "tx_ambiguous" // outcome unknowable right now (e.g. receipt unavailable)
  | "config" // invalid minter/provider configuration; retry cannot heal this
  | "wallet" // invalid or missing student wallet address
  | "already_issued" // credential already exists; must not mint again
  | "contended" // another instance owns the in-flight attempt
  | "internal"; // unexpected failure; bounded retry, then manual review

export const MAX_ISSUANCE_ATTEMPTS = 5;

// Base backoff between attempts (attempt n waits base * 2^(n-1)).
export const ISSUANCE_BACKOFF_BASE_MS = 30_000;
export const ISSUANCE_BACKOFF_MAX_MS = 15 * 60_000;

// How long a `pending` attempt is considered owned by another instance
// before recovery may claim it (see the orchestrator's atomic claim).
// Kept short (a mint attempt resolves in seconds): the attempts backoff
// below governs steady-state spacing, the lease only guards true overlap.
// Must stay below the backoff curve's growth, otherwise the `backoff`
// eligibility branch could never trigger.
export const ISSUANCE_LEASE_MS = 60_000;

export type Eligibility =
  | { eligible: true }
  | { eligible: false; reason: "already_issued" | "attempts_exhausted" | "backoff" | "not_verified" | "in_flight" };

export function attemptsBackoffMs(attempts: number): number {
  const exp = Math.max(0, attempts - 1);
  return Math.min(ISSUANCE_BACKOFF_BASE_MS * 2 ** exp, ISSUANCE_BACKOFF_MAX_MS);
}

// Whether a record's issuance may be (re)attempted right now. `now` and
// `updatedAtMs` are injectable for testing; `hasCredential` reflects whether
// a Credential row is already linked to this verification record.
export function issuanceEligibility(args: {
  verificationStatus: string;
  issuanceStatus: IssuanceStatus;
  attempts: number;
  hasCredential: boolean;
  nowMs: number;
  updatedAtMs: number | null;
}): Eligibility {
  if (args.hasCredential || args.issuanceStatus === "issued") {
    return { eligible: false, reason: "already_issued" };
  }
  if (args.verificationStatus !== "verified") {
    return { eligible: false, reason: "not_verified" };
  }
  if (args.attempts >= MAX_ISSUANCE_ATTEMPTS) {
    return { eligible: false, reason: "attempts_exhausted" };
  }
  // A fresh `pending` attempt is presumed owned by the instance running it
  // until the lease lapses; anything else (or a stale pending) may proceed
  // once backoff has elapsed. First-ever attempts skip the backoff wait.
  if (args.issuanceStatus === "pending" && args.attempts > 0 && args.updatedAtMs !== null) {
    const elapsed = args.nowMs - args.updatedAtMs;
    if (elapsed < ISSUANCE_LEASE_MS) {
      return { eligible: false, reason: "in_flight" };
    }
    if (elapsed < attemptsBackoffMs(args.attempts)) {
      return { eligible: false, reason: "backoff" };
    }
  }
  return { eligible: true };
}

// Classify a mint-path failure into a stable category. Matches on generic
// transport/chain/config signals only — caller must never persist or return
// the original message.
export function classifyIssuanceError(error: unknown): IssuanceErrorCategory {
  const message = error instanceof Error ? error.message : String(error);
  if (/already issued|already_issued|unique constraint|P2002/i.test(message)) return "already_issued";
  if (/timed out|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|network|socket hang up/i.test(message)) {
    return "rpc_timeout";
  }
  if (/revert|execution reverted|transaction failed|call execution failed/i.test(message)) return "tx_reverted";
  if (/environment variable is not set|not configured|unauthorized minter|not authorized/i.test(message)) {
    return "config";
  }
  if (/invalid.*address|checksum|missing wallet|no user found/i.test(message)) return "wallet";
  if (/ambiguous|unknown|not.?found|no receipt|receipt/i.test(message)) return "tx_ambiguous";
  return "internal";
}

// Student-safe copy for each retry-blocking reason. Never includes error
// details, hashes, or addresses.
export function retryBlockedMessage(reason: Exclude<Eligibility, { eligible: true }>["reason"]): string {
  switch (reason) {
    case "already_issued":
      return "Your credential is already issued.";
    case "attempts_exhausted":
      return "Automatic retries are exhausted. Contact support so we can reconcile your credential manually.";
    case "backoff":
    case "in_flight":
      return "Issuance is already in progress. Check back shortly.";
    case "not_verified":
      return "Complete verification first — issuance unlocks after your proof is validated.";
  }
}
export function issuanceFailureMessage(category: IssuanceErrorCategory): string {
  switch (category) {
    case "rpc_timeout":
    case "tx_ambiguous":
      return "The network did not confirm issuance in time. Your verification is safe — retry to reconcile.";
    case "tx_reverted":
      return "The issuance transaction was rejected by the network. Retry — no credential was created.";
    case "config":
    case "internal":
      return "Issuance hit a service problem. Your verification is safe — try again in a bit.";
    case "wallet":
      return "Your wallet record looks invalid. Sign out and back in, then retry.";
    case "already_issued":
      return "Your credential is already issued.";
    case "contended":
      return "Issuance is already in progress. Check back shortly.";
  }
}

const KNOWN_CATEGORIES: ReadonlySet<string> = new Set([
  "rpc_timeout",
  "tx_ambiguous",
  "tx_reverted",
  "config",
  "internal",
  "wallet",
  "already_issued",
  "contended",
]);

// Server-computed issuance summary for API responses. `retryAllowed` is
// the backend's verdict — the UI must render a retry action if and only if
// this is true. `message` is safe display copy (or null when issuance needs
// no explanation, e.g. freshly issued or never attempted).
export function describeIssuance(args: {
  verificationStatus: string;
  issuanceStatus: IssuanceStatus;
  attempts: number;
  hasCredential: boolean;
  lastError: string | null;
  nowMs: number;
  updatedAtMs: number | null;
}): { retryAllowed: boolean; message: string | null } {
  if (args.hasCredential || args.issuanceStatus === "issued") {
    return { retryAllowed: false, message: null };
  }
  const eligibility = issuanceEligibility({
    verificationStatus: args.verificationStatus,
    issuanceStatus: args.issuanceStatus,
    attempts: args.attempts,
    hasCredential: false,
    nowMs: args.nowMs,
    updatedAtMs: args.updatedAtMs,
  });
  if (!eligibility.eligible) {
    if (eligibility.reason === "already_issued") return { retryAllowed: false, message: null };
    return { retryAllowed: false, message: retryBlockedMessage(eligibility.reason) };
  }
  if (args.issuanceStatus === "failed") {
    const category = (
      args.lastError !== null && KNOWN_CATEGORIES.has(args.lastError) ? args.lastError : "internal"
    ) as IssuanceErrorCategory;
    return { retryAllowed: true, message: issuanceFailureMessage(category) };
  }
  if (args.issuanceStatus === "pending") {
    return {
      retryAllowed: true,
      message: "Credential issuance is pending. Retry is safe — it resumes without re-verifying.",
    };
  }
  return { retryAllowed: true, message: null };
}
