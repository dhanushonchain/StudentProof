// Runnable checks for lib/issuance-policy.ts (pure — no I/O, no env).
// Run:
//   ./node_modules/.bin/tsc lib/issuance-policy.selfcheck.ts lib/issuance-policy.ts \
//     --outDir /tmp/sp-issuance-selfcheck --module commonjs --target es2020 \
//     --moduleResolution node --skipLibCheck --strict --esModuleInterop \
//   && node /tmp/sp-issuance-selfcheck/issuance-policy.selfcheck.js
import assert from "node:assert/strict";
import {
  MAX_ISSUANCE_ATTEMPTS,
  attemptsBackoffMs,
  classifyIssuanceError,
  describeIssuance,
  issuanceEligibility,
  issuanceFailureMessage,
  retryBlockedMessage,
} from "./issuance-policy";

const NOW = 1_700_000_000_000;

// Fresh verified record: eligible, no backoff wait.
{
  const r = issuanceEligibility({
    verificationStatus: "verified",
    issuanceStatus: "not_started",
    attempts: 0,
    hasCredential: false,
    nowMs: NOW,
    updatedAtMs: null,
  });
  assert.deepEqual(r, { eligible: true });
}

// Issued (or credential present): never eligible again.
{
  const r = issuanceEligibility({
    verificationStatus: "verified",
    issuanceStatus: "issued",
    attempts: 1,
    hasCredential: false,
    nowMs: NOW,
    updatedAtMs: NOW,
  });
  assert.deepEqual(r, { eligible: false, reason: "already_issued" });
}

// Unverified proof: issuance locked regardless of attempts.
{
  for (const status of ["pending", "failed"]) {
    const r = issuanceEligibility({
      verificationStatus: status,
      issuanceStatus: "not_started",
      attempts: 0,
      hasCredential: false,
      nowMs: NOW,
      updatedAtMs: null,
    });
    assert.deepEqual(r, { eligible: false, reason: "not_verified" });
  }
}

// Attempt cap: exhausted at MAX, allowed just below.
{
  const exhausted = issuanceEligibility({
    verificationStatus: "verified",
    issuanceStatus: "failed",
    attempts: MAX_ISSUANCE_ATTEMPTS,
    hasCredential: false,
    nowMs: NOW,
    updatedAtMs: NOW - 3600_000,
  });
  assert.deepEqual(exhausted, { eligible: false, reason: "attempts_exhausted" });
  const lastChance = issuanceEligibility({
    verificationStatus: "verified",
    issuanceStatus: "failed",
    attempts: MAX_ISSUANCE_ATTEMPTS - 1,
    hasCredential: false,
    nowMs: NOW,
    updatedAtMs: NOW - 3600_000,
  });
  assert.deepEqual(lastChance, { eligible: true });
}

// Fresh pending attempt: presumed in flight until the lease lapses.
{
  const r = issuanceEligibility({
    verificationStatus: "verified",
    issuanceStatus: "pending",
    attempts: 1,
    hasCredential: false,
    nowMs: NOW,
    updatedAtMs: NOW - 10_000,
  });
  assert.deepEqual(r, { eligible: false, reason: "in_flight" });
}

// Stale pending past the lease but inside backoff: waits.
{
  // attempts=3 -> backoff 30s*2^2=120s; lease is 60s.
  const r = issuanceEligibility({
    verificationStatus: "verified",
    issuanceStatus: "pending",
    attempts: 3,
    hasCredential: false,
    nowMs: NOW,
    updatedAtMs: NOW - 90_000,
  });
  assert.deepEqual(r, { eligible: false, reason: "backoff" });
}

// Stale pending past both lease and backoff: eligible.
{
  const r = issuanceEligibility({
    verificationStatus: "verified",
    issuanceStatus: "pending",
    attempts: 3,
    hasCredential: false,
    nowMs: NOW,
    updatedAtMs: NOW - 300_000,
  });
  assert.deepEqual(r, { eligible: true });
}

// Backoff curve: exponential with cap.
{
  assert.equal(attemptsBackoffMs(1), 30_000);
  assert.equal(attemptsBackoffMs(2), 60_000);
  assert.equal(attemptsBackoffMs(3), 120_000);
  assert.ok(attemptsBackoffMs(99) <= 15 * 60_000);
}

// Error classification never leaks input: categories only.
{
  assert.equal(classifyIssuanceError(new Error("eth_estimateGas timed out after 30s")), "rpc_timeout");
  assert.equal(classifyIssuanceError(new Error("fetch failed: https://secret-rpc:8545 KEY=abc")), "rpc_timeout");
  assert.equal(classifyIssuanceError(new Error("execution reverted: ProviderNotTrusted")), "tx_reverted");
  assert.equal(classifyIssuanceError(new Error("MINTER_PRIVATE_KEY environment variable is not set")), "config");
  assert.equal(classifyIssuanceError(new Error("invalid address 0x123")), "wallet");
  assert.equal(classifyIssuanceError(new Error("Unique constraint failed (P2002)")), "already_issued");
  assert.equal(classifyIssuanceError(new Error("TransactionNotFound: 0xdead")), "tx_ambiguous");
  assert.equal(classifyIssuanceError(new Error("something completely new")), "internal");
  assert.equal(classifyIssuanceError("plain string failure"), "internal");
}

// UI copy contains no secrets and covers every branch.
{
  const blocked = retryBlockedMessage("attempts_exhausted");
  assert.ok(!/0x|key|secret|https?:/i.test(blocked));
  for (const category of [
    "rpc_timeout",
    "tx_ambiguous",
    "tx_reverted",
    "config",
    "internal",
    "wallet",
    "already_issued",
    "contended",
  ] as const) {
    const copy = issuanceFailureMessage(category);
    assert.ok(copy.length > 10, category);
    assert.ok(!/0x[a-f0-9]{4,}|private|secret|https?:/i.test(copy), category);
  }
}

// Server-computed retry verdicts for API responses.
{
  const base = {
    verificationStatus: "verified",
    attempts: 1,
    hasCredential: false,
    nowMs: NOW,
    updatedAtMs: NOW - 400_000,
  };
  // Failed + eligible: retry allowed with the categorized message.
  const failed = describeIssuance({ ...base, issuanceStatus: "failed", lastError: "rpc_timeout" });
  assert.equal(failed.retryAllowed, true);
  assert.ok(/retry to reconcile/i.test(failed.message ?? ""));
  // Unknown error category degrades to internal copy, never leaks.
  const weird = describeIssuance({ ...base, issuanceStatus: "failed", lastError: "EVM says 0xdead" });
  assert.equal(weird.retryAllowed, true);
  assert.ok(!/0xdead/i.test(weird.message ?? ""));
  // Issued: no retry, no message needed.
  assert.deepEqual(
    describeIssuance({ ...base, issuanceStatus: "issued", lastError: null }),
    { retryAllowed: false, message: null }
  );
  // Exhausted: support copy, no retry.
  const exhausted = describeIssuance({
    ...base,
    issuanceStatus: "failed",
    attempts: MAX_ISSUANCE_ATTEMPTS,
    lastError: "rpc_timeout",
  });
  assert.equal(exhausted.retryAllowed, false);
  assert.ok(/support/i.test(exhausted.message ?? ""));
}

console.log("issuance-policy: all checks passed");
