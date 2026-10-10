// Runnable check for lib/programme-expiry.ts — no test framework in this
// project yet, so this is a plain assert-based script: `npx tsx lib/programme-expiry.selfcheck.ts`
import assert from "node:assert/strict";
import { computeCredentialExpiry } from "./programme-expiry";

// Every credential expires exactly 1 year after issuance, regardless of
// programme/admission cycle (there's no longer any input for those).
{
  const now = new Date("2026-08-03T00:00:00Z");
  const { issuedAt, expiresAt } = computeCredentialExpiry(now);
  assert.equal(issuedAt.getTime(), now.getTime());
  assert.equal(expiresAt.getUTCFullYear(), 2027);
  assert.equal(expiresAt.getUTCMonth(), 7); // August
  assert.equal(expiresAt.getUTCDate(), 3);
}

// Defaults to "now" when no date is passed in.
{
  const before = Date.now();
  const { expiresAt } = computeCredentialExpiry();
  const oneYearFromNowApprox = before + 365 * 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(expiresAt.getTime() - oneYearFromNowApprox) < 2 * 24 * 60 * 60 * 1000);
}

console.log("programme-expiry: all checks passed");
