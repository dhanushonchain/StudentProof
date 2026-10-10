import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Authenticated issuance retry. Resumes a verified-but-unissued record
// through the recoverable orchestrator (atomic claim + chain
// reconciliation), WITHOUT requiring a new Google login or Reclaim proof.
//
// Body: {} (retries the caller's latest verified record) or
// { verificationId } for an explicit record. The record must belong to the
// caller's wallet — mismatches return 404 (not 403) so record ids can't be
// probed. There is deliberately NO unauthenticated mint trigger anywhere.
export async function POST(req: NextRequest) {
  const session = await auth();
  const walletAddress = session?.user?.walletPublicKey;

  if (!walletAddress) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { parseRetryRequestBody, AuthorizationError, RecordNotFoundError, BadRequestError } = await import(
    "@/lib/issuance-orchestrator"
  );
  let verificationId: string | null;
  try {
    ({ verificationId } = parseRetryRequestBody(body));
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const { retryCredentialIssuance } = await import("@/lib/verification-db");
  try {
    const result = await retryCredentialIssuance(walletAddress, verificationId);
    return NextResponse.json({
      outcome: result.outcome,
      issuanceStatus: result.issuanceStatus,
      attempts: result.attempts,
      retryAllowed: result.retryAllowed,
      message: result.message,
      tokenId: result.tokenId,
      txHash: result.txHash,
    });
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof RecordNotFoundError) {
      return NextResponse.json({ error: "No verification record found." }, { status: 404 });
    }
    console.error("[Issuance] Retry failed unexpectedly:", error);
    return NextResponse.json({ error: "Issuance retry failed unexpectedly." }, { status: 500 });
  }
}
