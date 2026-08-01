// Database-backed Reclaim verification tracking. Only called server-to-server
// (API routes) via lazy dynamic import, never from client — same reason
// lib/activity-db.ts and lib/wallet.ts are dynamically imported: this pulls
// in the Prisma client's Node-only engine, which is not Edge-Runtime-safe.

import { mintStudentCredential } from "./credential-contract";
import { prisma } from "./prisma";
import type { Address } from "viem";

export type VerificationStatus = "pending" | "verified" | "failed";

export type VerificationDTO = {
  id: string;
  status: VerificationStatus;
  proofReference: string | null;
  reclaimSessionId: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

function toDTO(record: {
  id: string;
  status: string;
  proofReference: string | null;
  reclaimSessionId: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}): VerificationDTO {
  return {
    id: record.id,
    status: record.status as VerificationStatus,
    proofReference: record.proofReference,
    reclaimSessionId: record.reclaimSessionId,
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

// Called from /api/verification/start right before creating the Reclaim
// proof request — the record's id is what setContext() correlates back to
// the callback with.
export async function createVerificationRecord(walletAddress: string): Promise<VerificationDTO> {
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) {
    throw new Error(`No user found for wallet ${walletAddress}`);
  }

  const record = await prisma.verificationRecord.create({
    data: { userId: user.id, provider: "reclaim", status: "pending" },
  });

  return toDTO(record);
}

// Called from /api/verification/start right after Reclaim hands back a
// sessionId — persisted so /api/verification/status can actively re-check
// Reclaim's servers (via fetchStatusUrl) even if the browser's in-memory
// copy of the sessionId is lost (page reload, tab remount, different device).
// Without this, a pending record with no PUBLIC_URL webhook configured could
// get stuck "pending" forever despite the user actually completing SAMARTH
// login, since there'd be no way left to ask Reclaim whether it finished.
export async function setReclaimSessionId(verificationRecordId: string, sessionId: string): Promise<void> {
  await prisma.verificationRecord.update({
    where: { id: verificationRecordId },
    data: { reclaimSessionId: sessionId },
  });
}

// Called from /api/verification/callback once verifyProof() succeeds. Also
// logs the "verification_completed" activity event, then mints the on-chain
// soulbound credential.
//
// Minting failure must never undo the verification above — the off-chain
// proof genuinely succeeded regardless of whether the mint transaction
// lands, so the DB write happens first and unconditionally. A mint failure
// is logged loudly (never thrown) so it's visible and can be retried/
// backfilled later, rather than silently corrupting a real verification.
export async function markVerified(verificationRecordId: string, proofReference: string): Promise<VerificationDTO> {
  const record = await prisma.verificationRecord.update({
    where: { id: verificationRecordId },
    data: { status: "verified", proofReference, verifiedAt: new Date() },
  });

  await prisma.activityEvent.create({
    data: { userId: record.userId, eventType: "verification_completed" },
  });

  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: record.userId } });
    const { contractAddress, tokenId, transactionHash } = await mintStudentCredential({
      studentAddress: user.walletAddress as Address,
      providerId: "reclaim",
    });

    await prisma.credential.create({
      data: { userId: record.userId, contractAddress, tokenId, status: "active" },
    });

    console.log(
      "[Credential] Minted for user",
      record.userId,
      "tokenId:",
      tokenId,
      "tx:",
      transactionHash
    );
  } catch (error) {
    console.error(
      "[Credential] Minting failed for verification",
      verificationRecordId,
      "(user",
      record.userId,
      ") — verification status is unaffected, this needs manual retry:",
      error
    );
  }

  return toDTO(record);
}

// Called from /api/verification/callback if verifyProof() fails.
export async function markFailed(verificationRecordId: string): Promise<VerificationDTO> {
  const record = await prisma.verificationRecord.update({
    where: { id: verificationRecordId },
    data: { status: "failed" },
  });

  return toDTO(record);
}

// Most recent verification for a user, if any — used both for the dashboard's
// initial server-rendered state and the client-side status poll.
export async function getLatestVerification(walletAddress: string): Promise<VerificationDTO | null> {
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) return null;

  const record = await prisma.verificationRecord.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return record ? toDTO(record) : null;
}
