import "server-only";

const appId = process.env.RECLAIM_APP_ID;
const appSecret = process.env.RECLAIM_APP_SECRET;

if (!appId) {
  throw new Error("RECLAIM_APP_ID environment variable is not set");
}
if (!appSecret) {
  throw new Error("RECLAIM_APP_SECRET environment variable is not set");
}

export const RECLAIM_APP_ID = appId;
export const RECLAIM_APP_SECRET = appSecret;

// Published Reclaim provider for Mumbai University's SAMARTH portal —
// "samarth-main". Proves Enrollment Number (OPRF-raw hashed), Programme
// Code, and Admission Year-Cycle, all from the student's own Programme
// Details page, with no hardcoded prg_id (URL matched by a structural regex
// so it works for any student). Proven end-to-end via a real zkTLS run_proof
// against a real production login (login -> dashboard "CLICK HERE" ->
// Programme Details page), auth-bound (confirmed a cookie-less replay
// 302-redirects rather than serving data). Supersedes
// samarth-programme-details-dynamic (689e7061-2c93-4fd7-a773-7c485c34bb9f)
// and the earlier enrollment-only provider
// (c731294f-7ac7-4083-8609-7c3785a883e1).
export const SAMARTH_PROVIDER_ID = "b56fb3c1-4bef-4150-81c0-0d2309f05e7c";

// The real extracted field values live in claimData.parameters (a JSON
// string) -> .paramValues, NOT claimData.context (that field is reserved for
// StudentProof's own setJsonContext payload, e.g. verificationRecordId).
// Confirmed directly against a real fetched Reclaim session's proof shape.
//
// What the CURRENT production provider (b56fb3c1-…) returns is UNVERIFIED:
// an earlier provider version demonstrably returned programmecode +
// admissionyearcycle (see git history for lib/programme-duration.json and
// the old selfcheck's captured SAMARTH example), while a later observation
// suggested enrolmentnumber-only. Do not treat either as ground truth until
// a live proof against the current provider ID is inspected.
//
// Either way, credential issuance MUST NOT depend on this function's result:
// expiry is programme-independent (see lib/programme-expiry.ts) and
// markVerified always attempts the mint for a verified proof. This function
// is retained as a documented, tested probe of provider shape only — its
// return value is never logged, stored, or minted, and it is never called
// on the issuance path.
export function extractProgrammeInfo(proof: {
  claimData: { parameters: string };
}): { programmeCode: string; admissionCycle: string } | undefined {
  try {
    const paramValues = JSON.parse(proof.claimData.parameters)?.paramValues;
    if (paramValues?.programmecode && paramValues?.admissionyearcycle) {
      return { programmeCode: paramValues.programmecode, admissionCycle: paramValues.admissionyearcycle };
    }
  } catch {
    // Malformed parameters — treat as absent, same as the production provider case.
  }
  return undefined;
}
