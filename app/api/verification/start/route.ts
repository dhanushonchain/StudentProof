import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth();
  const walletAddress = session?.user?.walletPublicKey;

  if (!walletAddress) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { createVerificationRecord, setReclaimSessionId } = await import("@/lib/verification-db");
  const { RECLAIM_APP_ID, RECLAIM_APP_SECRET, SAMARTH_PROVIDER_ID } = await import("@/lib/reclaim");
  const { ReclaimProofRequest } = await import("@reclaimprotocol/js-sdk");

  const record = await createVerificationRecord(walletAddress);

  // Reclaim calls below can fail (bad provider config, Reclaim outage,
  // network error). The pending record already exists, so a later retry
  // simply starts a fresh session — but the student must get actionable
  // JSON, never a 500 HTML page or internal details.
  try {
    const reclaimProofRequest = await ReclaimProofRequest.init(RECLAIM_APP_ID, RECLAIM_APP_SECRET, SAMARTH_PROVIDER_ID);

    const publicUrl = process.env.PUBLIC_URL;
    if (publicUrl) {
      reclaimProofRequest.setAppCallbackUrl(`${publicUrl}/api/verification/callback`, true);
    } else {
      console.warn(
        "[Verification] PUBLIC_URL not set — no webhook configured; relying on active status polling via fetchStatusUrl instead"
      );
    }

    // Correlates the callback (if configured) back to this VerificationRecord row.
    reclaimProofRequest.setJsonContext({ verificationRecordId: record.id });

    const requestUrl = await reclaimProofRequest.getRequestUrl();
    const sessionId = reclaimProofRequest.getSessionId();

    await setReclaimSessionId(record.id, sessionId);

    return NextResponse.json({ requestUrl, verificationId: record.id, sessionId });
  } catch (error) {
    console.error("[Verification] Failed to start Reclaim session for record", record.id, ":", error);
    return NextResponse.json(
      { error: "Verification could not start right now. Wait a moment and try again." },
      { status: 502 }
    );
  }
}
