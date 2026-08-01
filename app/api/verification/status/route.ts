import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const TERMINAL_FAILURE_STATUSES = new Set(["PROOF_GENERATION_FAILED", "PROOF_SUBMISSION_FAILED", "SESSION_CANCELLED"]);

// Polled by the dashboard while a verification is pending, and by the manual
// "check status" fallback button. When a sessionId is supplied, this doesn't
// just read our own DB — it actively asks Reclaim's servers whether the
// session has finished (via fetchStatusUrl) and self-heals the DB write that
// the webhook would otherwise do. This means verification completes even
// without a public webhook URL (e.g. no PUBLIC_URL/ngrok set up locally).
export async function GET(req: NextRequest) {
  const session = await auth();
  const walletAddress = session?.user?.walletPublicKey;

  if (!walletAddress) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { getLatestVerification, markVerified, markFailed } = await import("@/lib/verification-db");

  let verification = await getLatestVerification(walletAddress);

  // Prefer the client-supplied sessionId (fresher — it's whatever
  // /verification/start most recently handed back), but fall back to the
  // one persisted on the record itself. This is what makes verification
  // recoverable after a page reload/tab remount wipes the client's copy —
  // otherwise a genuinely-completed SAMARTH login could get stuck "pending"
  // forever with no PUBLIC_URL webhook to rescue it.
  const sessionId = req.nextUrl.searchParams.get("sessionId") ?? verification?.reclaimSessionId ?? null;

  if (verification?.status === "pending" && sessionId) {
    try {
      const { fetchStatusUrl, verifyProof } = await import("@reclaimprotocol/js-sdk");
      const { SAMARTH_PROVIDER_ID } = await import("@/lib/reclaim");

      const statusResult = await fetchStatusUrl(sessionId);
      const statusV2 = statusResult.session?.statusV2;
      const proofs = statusResult.session?.proofs;

      // Matches the Reclaim SDK's own definition of "done" for a session with
      // no custom callback URL (our case whenever PUBLIC_URL isn't set — see
      // startSession()'s isDefaultCallbackUrl branch in
      // @reclaimprotocol/js-sdk/dist/index.js): the terminal-success signal is
      // simply a non-empty proofs array, not a specific statusV2 value.
      // "PROOF_GENERATION_SUCCESS" never actually appears in the SDK's real
      // completion logic for this flow — checking for it here meant a session
      // that had genuinely finished (e.g. statusV2 "PROOF_SUBMITTED" with a
      // valid signed proof already attached) was never recognized as done.
      if (proofs?.length) {
        const result = await verifyProof(proofs.length === 1 ? proofs[0] : proofs, { providerId: SAMARTH_PROVIDER_ID });
        verification = result.isVerified
          ? await markVerified(verification.id, proofs[0].identifier)
          : await markFailed(verification.id);
      } else if (statusV2 && TERMINAL_FAILURE_STATUSES.has(statusV2)) {
        verification = await markFailed(verification.id);
      }
      // Any other status (still in progress) — leave the record as pending.
    } catch (error) {
      console.error("[Verification] Active status check failed:", error);
      // Non-fatal — the next poll tick or manual click will retry.
    }
  }

  return NextResponse.json({ verification });
}
