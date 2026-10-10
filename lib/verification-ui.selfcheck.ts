// Runnable checks for lib/verification-ui.ts (pure — no I/O, no env).
// Run:
//   ./node_modules/.bin/tsc lib/verification-ui.selfcheck.ts lib/verification-ui.ts \
//     --outDir /tmp/sp-ui-selfcheck --module commonjs --target es2020 \
//     --moduleResolution node --skipLibCheck --strict --esModuleInterop \
//   && node /tmp/sp-ui-selfcheck/verification-ui.selfcheck.js
import assert from "node:assert/strict";
import {
  deriveVerificationUi,
  isValidDateString,
  shouldKeepPolling,
  startErrorMessage,
  type UiCredentialInput,
  type UiVerificationInput,
} from "./verification-ui";

function verification(
  status: string,
  issuance?: { status: string; retryAllowed: boolean; message: string | null }
): UiVerificationInput {
  return { status, issuance: issuance ?? { status: "not_started", retryAllowed: false, message: null } };
}

const ACTIVE: UiCredentialInput = { status: "active", issuedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z" };
const EXPIRED: UiCredentialInput = { status: "expired", issuedAt: "2024-01-01T00:00:00.000Z", expiresAt: "2025-01-01T00:00:00.000Z" };

// No record: start prompt.
assert.deepEqual(deriveVerificationUi(null, []), { kind: "unverified" });

// Proof in flight: waiting on the university session — never "issuing".
assert.deepEqual(deriveVerificationUi(verification("pending"), []), { kind: "proof_pending" });

// Proof invalid: failure, and crucially NOT a mint failure (no retry-issuance).
{
  const state = deriveVerificationUi(verification("failed"), []);
  assert.deepEqual(state, { kind: "proof_failed" });
}

// Verified + active credential: issued card with the credential.
{
  const state = deriveVerificationUi(verification("verified", { status: "issued", retryAllowed: false, message: null }), [ACTIVE]);
  assert.deepEqual(state, { kind: "issued", credential: ACTIVE });
}

// Verified + issuance pending, no credential: separate issuing state.
{
  const state = deriveVerificationUi(
    verification("verified", { status: "pending", retryAllowed: true, message: "pending copy" }),
    []
  );
  assert.deepEqual(state, { kind: "issuing", message: "pending copy" });
}

// Verified + issuance failed: recoverable error with backend verdict.
{
  const retryable = deriveVerificationUi(
    verification("verified", { status: "failed", retryAllowed: true, message: "retry copy" }),
    []
  );
  assert.deepEqual(retryable, { kind: "issuance_failed", retryAllowed: true, message: "retry copy" });

  const exhausted = deriveVerificationUi(
    verification("verified", { status: "failed", retryAllowed: false, message: "support copy" }),
    []
  );
  assert.deepEqual(exhausted, { kind: "issuance_failed", retryAllowed: false, message: "support copy" });
}

// Backend says issued but the credential expired: truthful expired state,
// never an active-looking issued card.
{
  const state = deriveVerificationUi(
    verification("verified", { status: "issued", retryAllowed: false, message: null }),
    [EXPIRED]
  );
  assert.deepEqual(state, { kind: "verified_no_active_credential", detail: "expired" });
}

// A mint failure never erases verification: failed issuance with an old
// expired credential still offers issuance recovery, not re-verification.
{
  const state = deriveVerificationUi(
    verification("verified", { status: "failed", retryAllowed: true, message: "retry copy" }),
    [EXPIRED]
  );
  assert.deepEqual(state, { kind: "issuance_failed", retryAllowed: true, message: "retry copy" });
}

// Malformed/unknown inputs never crash: degraded safe states.
{
  assert.deepEqual(deriveVerificationUi({ status: "weird", issuance: { status: "odd", retryAllowed: false, message: null } }, []), {
    kind: "unverified",
  });
  assert.deepEqual(deriveVerificationUi(verification("verified"), [] as unknown as UiCredentialInput[]), {
    kind: "issuing",
    message: "Your student status is verified and issuance is pending. Refresh to check again.",
  });
  // Missing issuance block entirely (older cached payloads): treated as issuing, not issued.
  assert.deepEqual(
    deriveVerificationUi({ status: "verified", issuance: undefined } as unknown as UiVerificationInput, []),
    {
      kind: "issuing",
      message: "Your student status is verified and issuance is pending. Refresh to check again.",
    }
  );
}

// Dates render only when valid.
{
  assert.equal(isValidDateString("2026-01-01T00:00:00.000Z"), true);
  assert.equal(isValidDateString("not-a-date"), false);
  assert.equal(isValidDateString(""), false);
}

// Startup error copy: fixed strings, nothing internal.
{
  for (const kind of ["network", "unauthorized", "server", "unknown"] as const) {
    const copy = startErrorMessage(kind);
    assert.ok(copy.length > 10, kind);
    assert.ok(!/https?:|0x|stack|500|401/i.test(copy), kind);
  }
}

// Polling predicate: proof-pending and issuance-pending poll; everything
// terminal stops (manual refresh/retry take over from there).
{
  assert.equal(shouldKeepPolling(null), false);
  assert.equal(shouldKeepPolling(verification("pending")), true);
  assert.equal(
    shouldKeepPolling(verification("verified", { status: "pending", retryAllowed: true, message: null })),
    true
  );
  assert.equal(
    shouldKeepPolling(verification("verified", { status: "issued", retryAllowed: false, message: null })),
    false
  );
  assert.equal(
    shouldKeepPolling(verification("verified", { status: "failed", retryAllowed: true, message: "x" })),
    false
  );
  assert.equal(shouldKeepPolling(verification("failed")), false);
  assert.equal(shouldKeepPolling({ status: "verified", issuance: undefined } as unknown as UiVerificationInput), false);
}

console.log("verification-ui: all checks passed");
