// Database-backed Reclaim verification tracking. Only called server-to-server
// (API routes) via lazy dynamic import, never from client — same reason
// lib/activity-db.ts and lib/wallet.ts are dynamically imported: this pulls
// in the Prisma client's Node-only engine, which is not Edge-Runtime-safe.

import { findMintedTokenIds, getMintReceipt, mintStudentCredential } from "./credential-contract";
import {
  AlreadyIssuedError,
  attemptIssuance,
  findRecoverableRecordIds as findRecoverableIds,
  retryIssuanceForWallet,
  type AttemptResult,
  type ChainAdapter,
  type IssuanceRecordState,
  type IssuanceStore,
} from "./issuance-orchestrator";
import { describeIssuance, MAX_ISSUANCE_ATTEMPTS, type IssuanceStatus } from "./issuance-policy";
import { computeCredentialExpiry } from "./programme-expiry";
import { prisma } from "./prisma";
import type { Address, Hex } from "viem";

export type VerificationStatus = "pending" | "verified" | "failed";

export type IssuanceSummary = {
  status: IssuanceStatus;
  attempts: number;
  attemptsRemaining: number;
  retryAllowed: boolean;
  message: string | null;
  txHash: string | null;
};

export type VerificationDTO = {
  id: string;
  status: VerificationStatus;
  proofReference: string | null;
  reclaimSessionId: string | null;
  verifiedAt: string | null;
  createdAt: string;
  issuance: IssuanceSummary;
};

function toDTO(
  record: {
    id: string;
    status: string;
    proofReference: string | null;
    reclaimSessionId: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
    issuanceStatus: string;
    issuanceAttempts: number;
    lastIssuanceError: string | null;
    mintTxHash: string | null;
    issuanceUpdatedAt: Date | null;
  },
  hasCredential: boolean
): VerificationDTO {
  const described = describeIssuance({
    verificationStatus: record.status,
    issuanceStatus: record.issuanceStatus as IssuanceStatus,
    attempts: record.issuanceAttempts,
    hasCredential,
    lastError: record.lastIssuanceError,
    nowMs: Date.now(),
    updatedAtMs: record.issuanceUpdatedAt?.getTime() ?? null,
  });
  return {
    id: record.id,
    status: record.status as VerificationStatus,
    proofReference: record.proofReference,
    reclaimSessionId: record.reclaimSessionId,
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    issuance: {
      status: record.issuanceStatus as IssuanceStatus,
      attempts: record.issuanceAttempts,
      attemptsRemaining: Math.max(0, MAX_ISSUANCE_ATTEMPTS - record.issuanceAttempts),
      retryAllowed: described.retryAllowed,
      message: described.message,
      txHash: record.mintTxHash,
    },
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

  return toDTO(record, false);
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
//
// `programmeInfo` used to gate issuance: when the provider omitted
// programme fields, no expiry was computed and the mint was silently
// skipped while the record stayed "verified" — a dead end with no
// credential and no retry signal. Expiry is now programme-independent
// (exactly 1 year after issuance — see lib/programme-expiry.ts), so it is
// always computed and issuance is always attempted for a verified proof.
// Provider-field extraction (lib/reclaim.ts's extractProgrammeInfo) is kept
// as a documented, tested probe of provider shape for future diagnostics,
// but nothing in the issuance path may depend on it.
export async function markVerified(
  verificationRecordId: string,
  proofReference: string
): Promise<VerificationDTO> {
  const { expiresAt } = computeCredentialExpiry();

  const state = await prismaStore.markVerifiedPending(verificationRecordId, proofReference);

  await prisma.activityEvent.create({
    data: { userId: state.userId, eventType: "verification_completed" },
  });

  // Issuance runs through the recoverable orchestrator (atomic claim,
  // receipt/event reconciliation, bounded attempts). It never throws for a
  // valid proof — worst case the record stays verifiable-with-pending (or
  // failed-but-retryable) issuance, recoverable via POST /api/verification/retry.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: state.userId } });
  await attemptIssuance(state.id, {
    store: prismaStore,
    chain: chainAdapter,
    walletAddress: user.walletAddress,
    providerId: "reclaim",
    contractAddress: process.env.STUDENT_CREDENTIAL_REGISTRY_ADDRESS ?? "",
    expiresAt,
  });

  const record = await prisma.verificationRecord.findUniqueOrThrow({ where: { id: verificationRecordId } });
  const credential = await prisma.credential.findUnique({ where: { verificationRecordId } });
  return toDTO(record, credential !== null);
}

// Called from /api/verification/callback if verifyProof() fails.
// Proof failure never touches issuance: the record keeps issuanceStatus
// "not_started", so a failed proof is never shown as a mint failure and a
// later successful proof starts issuance fresh.
export async function markFailed(verificationRecordId: string): Promise<VerificationDTO> {
  const record = await prisma.verificationRecord.update({
    where: { id: verificationRecordId },
    data: { status: "failed" },
  });

  const linked = await prisma.credential.findUnique({ where: { verificationRecordId } });
  return toDTO(record, linked !== null);
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
  if (!record) return null;

  const linked = await prisma.credential.findUnique({ where: { verificationRecordId: record.id } });
  return toDTO(record, linked !== null);
}

export type CredentialDTO = {
  contractAddress: string;
  tokenId: string;
  issuedAt: string;
  expiresAt: string;
  // Computed at read time from the stored "active"/"revoked" status plus a
  // live comparison of expiresAt against now — natural expiry is never
  // written back to the DB, so this needs no background job to stay correct.
  status: "active" | "expired" | "revoked";
};

function toCredentialDTO(credential: {
  contractAddress: string;
  tokenId: string;
  status: string;
  issuedAt: Date;
  expiresAt: Date;
}): CredentialDTO {
  const status = credential.status === "revoked" ? "revoked" : credential.expiresAt <= new Date() ? "expired" : "active";

  return {
    contractAddress: credential.contractAddress,
    tokenId: credential.tokenId,
    issuedAt: credential.issuedAt.toISOString(),
    expiresAt: credential.expiresAt.toISOString(),
    status,
  };
}

// Every credential a user has ever been issued, most recently issued first —
// a wallet can hold several (e.g. BSc, later MSc), each an independent,
// permanent record. Callers that only need a single card (today's dashboard)
// can just take the first element; the array is here so a future multi-
// credential UI can render the rest without any backend changes.
export async function getCredentials(walletAddress: string): Promise<CredentialDTO[]> {
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) return [];

  const credentials = await prisma.credential.findMany({
    where: { userId: user.id },
    orderBy: { issuedAt: "desc" },
  });

  return credentials.map(toCredentialDTO);
}

// --- Issuance store (Prisma implementation) + recovery entry points ---
//
// The orchestrator (lib/issuance-orchestrator.ts) is deliberately free of
// Prisma/viem imports so it can be tested against fakes or a scratch
// database. This section adapts the real database and chain.

type PrismaVerificationRecord = {
  id: string;
  userId: string;
  status: string;
  proofReference: string | null;
  issuanceStatus: string;
  issuanceAttempts: number;
  lastIssuanceError: string | null;
  mintTxHash: string | null;
  issuanceUpdatedAt: Date | null;
  verifiedAt: Date | null;
};

function toIssuanceState(record: PrismaVerificationRecord): IssuanceRecordState {
  return {
    id: record.id,
    userId: record.userId,
    status: record.status,
    proofReference: record.proofReference,
    issuanceStatus: record.issuanceStatus as IssuanceStatus,
    issuanceAttempts: record.issuanceAttempts,
    lastIssuanceError: record.lastIssuanceError,
    mintTxHash: record.mintTxHash,
    issuanceUpdatedAt: record.issuanceUpdatedAt,
    verifiedAt: record.verifiedAt,
  };
}

const CLAIMABLE_ISSUANCE_STATES = ["not_started", "pending", "failed"];

export const prismaStore: IssuanceStore = {
  async findUserByWallet(walletAddress: string) {
    return prisma.user.findUnique({ where: { walletAddress }, select: { id: true } });
  },

  async findRecord(recordId: string) {
    const record = await prisma.verificationRecord.findUnique({ where: { id: recordId } });
    return record ? toIssuanceState(record) : null;
  },

  async findLatestVerifiedRecordId(userId: string) {
    const record = await prisma.verificationRecord.findFirst({
      where: { userId, status: "verified" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return record?.id ?? null;
  },

  async findCredentialByRecord(recordId: string) {
    const credential = await prisma.credential.findUnique({ where: { verificationRecordId: recordId } });
    return credential
      ? { id: credential.id, contractAddress: credential.contractAddress, tokenId: credential.tokenId }
      : null;
  },

  async findCredentialsByUser(userId: string) {
    return prisma.credential.findMany({
      where: { userId },
      select: { id: true, contractAddress: true, tokenId: true },
    });
  },

  async findRecoverableRecordIds(limit: number) {
    const records = await prisma.verificationRecord.findMany({
      where: {
        status: "verified",
        issuanceStatus: { in: CLAIMABLE_ISSUANCE_STATES },
        issuanceAttempts: { lt: MAX_ISSUANCE_ATTEMPTS },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return records.map((r) => r.id);
  },

  // Single atomic statement: only one instance (or retry) can win the claim,
  // because the write only matches when the row still shows the expected
  // attempt count. Works across processes and machines — no in-process lock.
  async claimIssuance(recordId: string, expectedAttempts: number) {
    const { count } = await prisma.verificationRecord.updateMany({
      where: {
        id: recordId,
        status: "verified",
        issuanceStatus: { in: CLAIMABLE_ISSUANCE_STATES },
        issuanceAttempts: expectedAttempts,
      },
      data: { issuanceAttempts: expectedAttempts + 1, issuanceUpdatedAt: new Date() },
    });
    return count === 1;
  },

  async markVerifiedPending(recordId: string, proofReference: string) {
    const record = await prisma.verificationRecord.update({
      where: { id: recordId },
      data: { status: "verified", proofReference, verifiedAt: new Date(), issuanceStatus: "pending" },
    });
    return toIssuanceState(record);
  },

  async setIssuanceState(recordId: string, state) {
    await prisma.verificationRecord.update({
      where: { id: recordId },
      data: {
        issuanceStatus: state.status,
        ...(state.error !== undefined ? { lastIssuanceError: state.error } : {}),
        ...(state.txHash !== undefined ? { mintTxHash: state.txHash } : {}),
      },
    });
  },

  async saveIssuedCredential(args) {
    try {
      const credential = await prisma.credential.create({
        data: {
          userId: args.userId,
          contractAddress: args.contractAddress,
          tokenId: args.tokenId,
          status: "active",
          expiresAt: args.expiresAt,
          verificationRecordId: args.recordId,
        },
      });
      return { id: credential.id, contractAddress: credential.contractAddress, tokenId: credential.tokenId };
    } catch (error) {
      // The UNIQUE(verificationRecordId) guard fired: a concurrent attempt
      // persisted first. Heal to issued instead of minting again.
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new AlreadyIssuedError(`Credential already persisted for record ${args.recordId}`);
      }
      throw error;
    }
  },

  async recordActivity(userId: string, eventType: string) {
    await prisma.activityEvent.create({ data: { userId, eventType } });
  },
};

const chainAdapter: ChainAdapter = {
  async mint({ studentAddress, providerId, expiresAt }) {
    const { contractAddress, tokenId, transactionHash } = await mintStudentCredential({
      studentAddress: studentAddress as Address,
      providerId,
      expiresAt,
    });
    return { contractAddress, tokenId, transactionHash };
  },
  async getReceipt(txHash: string) {
    return getMintReceipt(txHash as Hex);
  },
  async findMintedTokenIds(walletAddress: string) {
    return findMintedTokenIds(walletAddress);
  },
};

// Authenticated retry entry point for POST /api/verification/retry.
// Ownership is enforced inside retryIssuanceForWallet (mismatches throw
// AuthorizationError, mapped to 404 so records can't be probed).
export async function retryCredentialIssuance(
  walletAddress: string,
  verificationId: string | null
): Promise<AttemptResult> {
  const { expiresAt } = computeCredentialExpiry();
  return retryIssuanceForWallet(walletAddress, verificationId, {
    store: prismaStore,
    chain: chainAdapter,
    providerId: "reclaim",
    contractAddress: process.env.STUDENT_CREDENTIAL_REGISTRY_ADDRESS ?? "",
    expiresAt,
  });
}

// Sweep helper for historical verified-without-credential records. Returns
// ids only — each still goes through attemptIssuance (and its claim), so
// this is safe to expose to an operator tool or future worker, but it is
// NOT auto-executed anywhere: recovery stays explicit and auditable.
export async function findRecoverableIssuances(limit = 50): Promise<string[]> {
  return findRecoverableIds(prismaStore, limit);
}
