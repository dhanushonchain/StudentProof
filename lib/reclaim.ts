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
// "samarth-programme-details-dynamic". Proves Enrollment Number (OPRF-raw
// hashed, same mechanism as the prior enrollment-only provider), Programme
// Code, and Admission Year-Cycle, all from the student's own Programme
// Details page, with no hardcoded prg_id (URL matched by a structural regex
// so it works for any student). Validated end-to-end via Reclaim's Try Demo
// tool: real SAMARTH login, real navigation, all three fields extracted
// correctly. Supersedes the earlier enrollment-only provider
// (c731294f-7ac7-4083-8609-7c3785a883e1), which only proved enrolmentnumber
// and cannot support expiresAt computation.
export const SAMARTH_PROVIDER_ID = "689e7061-2c93-4fd7-a773-7c485c34bb9f";

// The real extracted field values live in claimData.parameters (a JSON
// string) -> .paramValues, NOT claimData.context (that field is reserved for
// StudentProof's own setJsonContext payload, e.g. verificationRecordId).
// Confirmed directly against a real fetched Reclaim session's proof shape.
// Returns undefined for the current production SAMARTH provider, which only
// ever proves enrolmentnumber — programmeCode/admissionCycle simply aren't
// present in that provider's paramValues.
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
