import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Reclaim's webhook target, set via setAppCallbackUrl in /api/verification/start
// (jsonProofResponse: true there means the body arrives as parsed JSON already).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const proof = Array.isArray(body) ? body[0] : body;

  if (!proof?.claimData) {
    return NextResponse.json({ error: "Malformed proof payload" }, { status: 400 });
  }

  const { verifyProof } = await import("@reclaimprotocol/js-sdk");
  const { SAMARTH_PROVIDER_ID } = await import("@/lib/reclaim");
  const { markVerified, markFailed } = await import("@/lib/verification-db");

  // Recover which VerificationRecord this proof correlates to — set via
  // setJsonContext({ verificationRecordId }) in /start, round-trips as a JSON
  // string on claimData.context (confirmed against the SDK source directly).
  let verificationRecordId: string | undefined;
  try {
    verificationRecordId = JSON.parse(proof.claimData.context)?.verificationRecordId;
  } catch {
    // fall through — handled by the missing-id check below
  }

  if (!verificationRecordId) {
    return NextResponse.json({ error: "Missing verificationRecordId in proof context" }, { status: 400 });
  }

  const result = await verifyProof(proof, { providerId: SAMARTH_PROVIDER_ID });

  if (!result.isVerified) {
    console.error("[Verification] verifyProof failed:", result.error);
    await markFailed(verificationRecordId);
    return NextResponse.json({ verified: false, error: result.error?.message }, { status: 400 });
  }

  await markVerified(verificationRecordId, proof.identifier);

  return NextResponse.json({ verified: true });
}
