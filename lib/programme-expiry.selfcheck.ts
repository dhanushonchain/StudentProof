// Runnable check for lib/programme-expiry.ts — no test framework in this
// project yet, so this is a plain assert-based script: `npx tsx lib/programme-expiry.selfcheck.ts`
import assert from "node:assert/strict";
import { computeCredentialExpiry, UnknownProgrammeCodeError, UnknownAdmissionCycleError } from "./programme-expiry";

// Real example from this project's captured SAMARTH data: programme 1151061
// (3-year duration), admission cycle 2024-JULY -> expires July 2027.
{
  const { expiresAt } = computeCredentialExpiry("1151061", "2024-JULY");
  assert.equal(expiresAt.getUTCFullYear(), 2027);
  assert.equal(expiresAt.getUTCMonth(), 6); // July
}

// Unknown programme code fails fast, doesn't silently guess a duration.
{
  assert.throws(() => computeCredentialExpiry("9999999", "2024-JULY"), UnknownProgrammeCodeError);
}

// Unknown admission cycle fails fast too.
{
  assert.throws(() => computeCredentialExpiry("1151061", "2024-APRIL"), UnknownAdmissionCycleError);
}

// issuedAt is exactly whatever "now" the caller passes in (verification time).
{
  const now = new Date("2026-08-03T00:00:00Z");
  const { issuedAt } = computeCredentialExpiry("1151062", "2024-JULY", now);
  assert.equal(issuedAt.getTime(), now.getTime());
}

console.log("programme-expiry: all checks passed");
