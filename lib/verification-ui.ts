// Pure dashboard state derivation: backend DTOs in, UI state out. Zero
// imports — safe to unit-test anywhere.
//
// The UI must never conflate proof validation with credential issuance:
// a proof failure is never shown as a mint failure, and a mint failure
// never erases a successful verification. Every kind below maps to exactly
// one backend-substantiated situation; anything time-based or ephemeral
// (polling, in-flight button spinners, startup errors) stays client-side.

export type UiVerificationInput = {
  status: string;
  issuance: {
    status: string;
    retryAllowed: boolean;
    message: string | null;
  };
} | null;

export type UiCredentialInput = {
  status: string;
  issuedAt: string;
  expiresAt: string;
};

export type VerificationUiState<C = UiCredentialInput> =
  | { kind: "unverified" }
  | { kind: "proof_pending" }
  | { kind: "proof_failed" }
  | { kind: "issuing"; message: string }
  | { kind: "issuance_failed"; retryAllowed: boolean; message: string }
  | { kind: "issued"; credential: C }
  | { kind: "verified_no_active_credential"; detail: "expired" | "revoked" | "none" };

export function isValidDateString(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  return !Number.isNaN(Date.parse(value));
}

// Whether the dashboard should keep polling the status endpoint: while the
// proof is pending, or while a verified proof still has issuance pending.
// Every other state is terminal for polling (issued/failed issuance,
// failed verification, or nothing to check) and relies on manual refresh
// or retry — polling must never trigger issuance itself.
export function shouldKeepPolling(verification: UiVerificationInput): boolean {
  if (!verification) return false;
  if (verification.status === "pending") return true;
  return verification.status === "verified" && verification.issuance?.status === "pending";
}

// Client-side startup failures (the verification request never reached a
// verdict). Fixed copy — no status codes, URLs, or stack traces in the UI.
export type StartErrorKind = "network" | "unauthorized" | "server" | "unknown";

export function startErrorMessage(kind: StartErrorKind): string {
  switch (kind) {
    case "network":
      return "Could not reach StudentProof. Check your connection and try again.";
    case "unauthorized":
      return "Your session expired. Sign in again, then retry verification.";
    case "server":
      return "Verification could not start right now. Wait a moment and try again.";
    case "unknown":
      return "Something went wrong starting verification. Try again.";
  }
}

const ISSUING_FALLBACK = "Your student status is verified and issuance is pending. Refresh to check again.";
const ISSUANCE_FAILED_FALLBACK =
  "Credential issuance did not complete. Your verification is safe — retry to resume without re-verifying.";

export function deriveVerificationUi<C extends UiCredentialInput>(
  verification: UiVerificationInput,
  credentials: C[]
): VerificationUiState<C> {
  const list: C[] = Array.isArray(credentials) ? credentials : [];

  if (!verification) return { kind: "unverified" };
  if (verification.status === "pending") return { kind: "proof_pending" };
  if (verification.status === "failed") return { kind: "proof_failed" };

  // status === "verified" (any other value falls through to unverified-safe
  // handling below by treating unknown verification states as unverified).
  if (verification.status !== "verified") return { kind: "unverified" };

  const active = list.find((c) => c.status === "active");
  if (active) return { kind: "issued", credential: active };

  const issuanceStatus = verification.issuance?.status ?? "not_started";
  if (issuanceStatus === "failed") {
    return {
      kind: "issuance_failed",
      retryAllowed: verification.issuance?.retryAllowed ?? false,
      message: verification.issuance?.message ?? ISSUANCE_FAILED_FALLBACK,
    };
  }
  if (issuanceStatus === "issued") {
    // Backend says issued but no row is visible: surface the credential
    // list truthfully instead of inventing an issued card.
    const anyCredential = list[0];
    if (anyCredential?.status === "expired") return { kind: "verified_no_active_credential", detail: "expired" };
    if (anyCredential?.status === "revoked") return { kind: "verified_no_active_credential", detail: "revoked" };
    return { kind: "issuing", message: ISSUING_FALLBACK };
  }
  if (issuanceStatus === "pending" || issuanceStatus === "not_started") {
    return { kind: "issuing", message: verification.issuance?.message ?? ISSUING_FALLBACK };
  }
  return { kind: "unverified" };
}
