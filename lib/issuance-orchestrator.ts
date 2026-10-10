// Credential-issuance orchestrator: claim, reconcile, mint, finalize.
//
// Design constraints (see task brief):
// - Works across instances: the ONLY cross-instance guard is the atomic
//   claim (optimistic concurrency on issuanceAttempts). No in-memory mutex.
// - On-chain exactly-once is NOT guaranteed by the contract (it deliberately
//   permits multiple credentials per wallet), so this module reconciles via
//   txHash receipts and CredentialMinted event scans before rebroadcasting,
//   and relies on the DB UNIQUE(Credential.verificationRecordId) as the
//   second guard. Residual double-mint risk is documented, never claimed away.
// - No heavy imports here (no prisma/viem/server-only): collaborators arrive
//   via `Deps`, so tests can inject fakes or a scratch database. Production
//   wiring lives in lib/verification-db.ts.
//
// Every state transition is persisted before moving on, so a restart simply
// resumes from the database (the orchestrator itself is stateless).

import {
  MAX_ISSUANCE_ATTEMPTS,
  attemptsBackoffMs,
  classifyIssuanceError,
  issuanceEligibility,
  issuanceFailureMessage,
  retryBlockedMessage,
  type IssuanceErrorCategory,
  type IssuanceStatus,
} from "./issuance-policy";

export class RecordNotFoundError extends Error {}
export class AuthorizationError extends Error {}
export class AlreadyIssuedError extends Error {}
export class BadRequestError extends Error {}

// Validates the POST /api/verification/retry body. Only an optional
// verificationId is accepted; everything else is rejected (never silently
// ignored) so malformed callers get a 400, not a default action.
export function parseRetryRequestBody(body: unknown): { verificationId: string | null } {
  if (body === null || body === undefined) return { verificationId: null };
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestError("Request body must be a JSON object");
  }
  const { verificationId } = body as { verificationId?: unknown };
  if (verificationId === undefined) return { verificationId: null };
  if (typeof verificationId !== "string" || verificationId.length === 0 || verificationId.length > 100) {
    throw new BadRequestError("verificationId must be a non-empty string");
  }
  return { verificationId };
}

export type IssuanceRecordState = {
  id: string;
  userId: string;
  status: string;
  proofReference: string | null;
  issuanceStatus: IssuanceStatus;
  issuanceAttempts: number;
  lastIssuanceError: string | null;
  mintTxHash: string | null;
  issuanceUpdatedAt: Date | null;
  verifiedAt: Date | null;
};

export type StoredCredential = {
  id: string;
  contractAddress: string;
  tokenId: string;
};

// Minimal persistence surface the orchestrator needs. lib/verification-db.ts
// implements this against Prisma; tests implement it against a scratch DB
// or fakes.
export interface IssuanceStore {
  findUserByWallet(walletAddress: string): Promise<{ id: string } | null>;
  findRecord(recordId: string): Promise<IssuanceRecordState | null>;
  findLatestVerifiedRecordId(userId: string): Promise<string | null>;
  findCredentialByRecord(recordId: string): Promise<StoredCredential | null>;
  findCredentialsByUser(userId: string): Promise<StoredCredential[]>;
  findRecoverableRecordIds(limit: number): Promise<string[]>;
  // Atomic cross-instance claim: set attempts=expected+1 and refresh the
  // timestamp IFF the row still shows expectedAttempts. Returns true only
  // for the single winner.
  claimIssuance(recordId: string, expectedAttempts: number): Promise<boolean>;
  markVerifiedPending(recordId: string, proofReference: string): Promise<IssuanceRecordState>;
  setIssuanceState(
    recordId: string,
    state: { status: IssuanceStatus; error?: IssuanceErrorCategory | null; txHash?: string | null }
  ): Promise<void>;
  // Persists the minted credential linked to the record. MUST throw
  // AlreadyIssuedError (not a raw driver error) when a credential already
  // references this record.
  saveIssuedCredential(args: {
    recordId: string;
    userId: string;
    contractAddress: string;
    tokenId: string;
    expiresAt: Date;
  }): Promise<StoredCredential>;
  recordActivity(userId: string, eventType: string): Promise<void>;
}

export interface MintRequest {
  studentAddress: string;
  providerId: string;
  expiresAt: Date;
}

export interface MintResult {
  contractAddress: string;
  tokenId: string;
  transactionHash: string;
}

// Receipt lookup for a previously broadcast hash. `found: false` covers
// "unknown hash" AND "still pending" (viem cannot distinguish them) —
// callers must treat it as ambiguous, never as failure.
export type ReceiptCheck = { found: false } | { found: true; succeeded: boolean; tokenId: string | null };

export interface ChainAdapter {
  mint(request: MintRequest): Promise<MintResult>;
  getReceipt(txHash: string): Promise<ReceiptCheck>;
  // tokenIds ever minted to this wallet per CredentialMinted logs.
  findMintedTokenIds(walletAddress: string): Promise<string[]>;
}

export type AttemptOutcome =
  | "issued"
  | "already_issued"
  | "failed_retryable"
  | "failed_exhausted"
  | "ambiguous_pending"
  | "not_eligible"
  | "contended";

export type AttemptResult = {
  outcome: AttemptOutcome;
  issuanceStatus: IssuanceStatus;
  attempts: number;
  retryAllowed: boolean;
  message: string;
  tokenId: string | null;
  txHash: string | null;
};

export type IssuanceDeps = {
  store: IssuanceStore;
  chain: ChainAdapter;
  walletAddress: string;
  providerId: string;
  // Registry address new credentials are minted on. Repair/adopt paths
  // persist this (never an empty string) so links and reads stay correct.
  contractAddress: string;
  expiresAt: Date;
  nowMs?: () => number;
};

function resultFor(
  outcome: AttemptOutcome,
  state: Pick<IssuanceRecordState, "issuanceStatus" | "issuanceAttempts" | "mintTxHash">,
  opts: { tokenId?: string | null; message?: string } = {}
): AttemptResult {
  const retryAllowed =
    outcome === "failed_retryable" || outcome === "ambiguous_pending" || outcome === "contended";
  return {
    outcome,
    issuanceStatus: state.issuanceStatus,
    attempts: state.issuanceAttempts,
    retryAllowed,
    message:
      opts.message ??
      (outcome === "issued" || outcome === "already_issued"
        ? "Credential issued."
        : "Issuance did not complete. Retry is safe."),
    tokenId: opts.tokenId ? opts.tokenId : null,
    txHash: state.mintTxHash,
  };
}

async function finalizeIssued(
  store: IssuanceStore,
  record: IssuanceRecordState,
  credential: { contractAddress: string; tokenId: string | null }
): Promise<AttemptResult> {
  await store.setIssuanceState(record.id, { status: "issued", error: null });
  await store.recordActivity(record.userId, "credential_issued");
  return resultFor("issued", { ...record, issuanceStatus: "issued" }, {
    tokenId: credential.tokenId,
    message: "Credential issued.",
  });
}

// The shared mint-and-persist step. The UNIQUE(verificationRecordId) guard
// means a concurrent reconciler that persisted first turns our P2002 into
// an AlreadyIssuedError, which we heal to issued instead of re-minting.
async function persistMint(
  store: IssuanceStore,
  record: IssuanceRecordState,
  mint: { contractAddress: string; tokenId: string; transactionHash: string },
  expiresAt: Date
): Promise<AttemptResult> {
  try {
    const credential = await store.saveIssuedCredential({
      recordId: record.id,
      userId: record.userId,
      contractAddress: mint.contractAddress,
      tokenId: mint.tokenId,
      expiresAt,
    });
    await store.setIssuanceState(record.id, { status: "issued", error: null, txHash: mint.transactionHash });
    await store.recordActivity(record.userId, "credential_issued");
    return resultFor("issued", { ...record, issuanceStatus: "issued", mintTxHash: mint.transactionHash }, {
      tokenId: credential.tokenId,
      message: "Credential issued.",
    });
  } catch (error) {
    if (error instanceof AlreadyIssuedError) {
      return finalizeIssued(store, record, { contractAddress: mint.contractAddress, tokenId: mint.tokenId || null });
    }
    throw error;
  }
}

export async function attemptIssuance(recordId: string, deps: IssuanceDeps): Promise<AttemptResult> {
  const { store, chain } = deps;
  const now = deps.nowMs ?? Date.now;

  const record = await store.findRecord(recordId);
  if (!record) throw new RecordNotFoundError(`No issuance record ${recordId}`);

  // 1. A linked credential row is authoritative: never mint again.
  const existing = await store.findCredentialByRecord(record.id);
  if (existing) {
    if (record.issuanceStatus !== "issued") {
      await finalizeIssued(store, record, existing);
    }
    return resultFor("already_issued", { ...record, issuanceStatus: "issued" }, {
      tokenId: existing.tokenId,
      message: "Credential is already issued.",
    });
  }

  // 2. Eligibility (verified? attempts left? backoff elapsed? lease free?).
  const eligibility = issuanceEligibility({
    verificationStatus: record.status,
    issuanceStatus: record.issuanceStatus,
    attempts: record.issuanceAttempts,
    hasCredential: false,
    nowMs: now(),
    updatedAtMs: record.issuanceUpdatedAt?.getTime() ?? null,
  });
  if (!eligibility.eligible) {
    if (eligibility.reason === "already_issued") {
      return resultFor("already_issued", record, { message: "Credential is already issued." });
    }
    return {
      outcome: "not_eligible",
      issuanceStatus: record.issuanceStatus,
      attempts: record.issuanceAttempts,
      retryAllowed: false,
      message: retryBlockedMessage(eligibility.reason),
      tokenId: null,
      txHash: record.mintTxHash,
    };
  }

  // 3. Atomic cross-instance claim. Exactly one caller wins; losers back off
  // without touching chain or database state.
  const claimed = await store.claimIssuance(record.id, record.issuanceAttempts);
  if (!claimed) {
    return resultFor("contended", record, { message: issuanceFailureMessage("contended") });
  }
  const attempts = record.issuanceAttempts + 1;

  // 4. Reconcile before any broadcast.
  if (record.mintTxHash) {
    const receipt = await chain.getReceipt(record.mintTxHash);
    if (receipt.found && receipt.succeeded && receipt.tokenId) {
      // Mined but previously unrecorded (e.g. crash between mint and DB
      // write): repair the database, do not rebroadcast.
      const repaired = await persistMint(
        store,
        { ...record, issuanceAttempts: attempts },
        { contractAddress: deps.contractAddress, tokenId: receipt.tokenId, transactionHash: record.mintTxHash },
        deps.expiresAt
      );
      return repaired;
    }
    if (receipt.found && receipt.succeeded && !receipt.tokenId) {
      await store.setIssuanceState(record.id, { status: "failed", error: "tx_ambiguous" });
      return resultFor("failed_retryable", { ...record, issuanceStatus: "failed", issuanceAttempts: attempts }, {
        message: "The transaction confirmed without a recognizable credential event. Manual review may be needed.",
      });
    }
    if (receipt.found && !receipt.succeeded) {
      // Reverted: no state change on chain, safe to retry without the hash.
      await store.setIssuanceState(record.id, { status: "failed", error: "tx_reverted", txHash: null });
      return resultFor("failed_retryable", { ...record, issuanceStatus: "failed", issuanceAttempts: attempts }, {
        message: issuanceFailureMessage("tx_reverted"),
      });
    }
    // Receipt unavailable: pending-or-dropped is indistinguishable. Retain
    // pending so a later attempt re-checks; never blindly resubmit.
    await store.setIssuanceState(record.id, { status: "pending", error: "tx_ambiguous" });
    return resultFor("ambiguous_pending", { ...record, issuanceStatus: "pending", issuanceAttempts: attempts }, {
      message: issuanceFailureMessage("tx_ambiguous"),
    });
  }

  // No known hash: scan CredentialMinted events for this wallet. A single
  // unrecorded token means a previous broadcast landed without a DB write
  // (timeout before hash, or crash after mint) — adopt it instead of
  // minting again. Zero means a fresh mint is safe. Several unrecorded
  // tokens is genuinely ambiguous: keep pending for manual review.
  const [minted, known] = await Promise.all([
    chain.findMintedTokenIds(deps.walletAddress),
    store.findCredentialsByUser(record.userId),
  ]);
  const knownIds = new Set(known.map((c) => c.tokenId));
  const unrecorded = minted.filter((id) => !knownIds.has(id));
  if (unrecorded.length === 1 && unrecorded[0] !== undefined) {
    const adopted = await persistMint(
      store,
      { ...record, issuanceAttempts: attempts },
      { contractAddress: deps.contractAddress, tokenId: unrecorded[0], transactionHash: "" },
      deps.expiresAt
    );
    return adopted;
  }
  if (unrecorded.length > 1) {
    await store.setIssuanceState(record.id, { status: "pending", error: "tx_ambiguous" });
    return resultFor("ambiguous_pending", { ...record, issuanceStatus: "pending", issuanceAttempts: attempts }, {
      message: "Multiple unrecognized on-chain credentials need manual review before retrying.",
    });
  }

  // 5. Fresh mint (claim won + reconciliation found nothing to adopt).
  try {
    const mint = await chain.mint({
      studentAddress: deps.walletAddress,
      providerId: deps.providerId,
      expiresAt: deps.expiresAt,
    });
    return await persistMint(
      store,
      { ...record, issuanceAttempts: attempts },
      mint,
      deps.expiresAt
    );
  } catch (error) {
    const category = classifyIssuanceError(error);
    if (category === "already_issued") {
      return finalizeIssued(store, { ...record, issuanceAttempts: attempts }, { contractAddress: deps.contractAddress, tokenId: null });
    }
    // Timeouts/ambiguity stay `pending` (self-healing on next attempt via
    // the receipt/event-scan paths above). Everything else is `failed` but
    // retryable until the attempt cap.
    const staysPending = category === "rpc_timeout" || category === "tx_ambiguous";
    await store.setIssuanceState(record.id, {
      status: staysPending ? "pending" : "failed",
      error: category,
    });
    const exhausted = attempts >= MAX_ISSUANCE_ATTEMPTS;
    return {
      outcome: exhausted ? "failed_exhausted" : staysPending ? "ambiguous_pending" : "failed_retryable",
      issuanceStatus: staysPending ? "pending" : "failed",
      attempts,
      retryAllowed: !exhausted,
      message: exhausted
        ? retryBlockedMessage("attempts_exhausted")
        : issuanceFailureMessage(category),
      tokenId: null,
      txHash: record.mintTxHash,
    };
  }
}

export function assertRecordOwnedBy(recordUserId: string, callerUserId: string, recordId: string): void {
  if (!recordUserId || !callerUserId || recordUserId !== callerUserId) {
    throw new AuthorizationError(`Not authorized for issuance record ${recordId}`);
  }
}

// Authenticated retry entry point: resolves the caller's record (explicit
// id or latest verified), enforces ownership, then attempts issuance.
// Throws RecordNotFoundError / AuthorizationError for the route to map.
export async function retryIssuanceForWallet(
  walletAddress: string,
  verificationId: string | null,
  deps: Omit<IssuanceDeps, "walletAddress">
): Promise<AttemptResult> {
  const user = await deps.store.findUserByWallet(walletAddress);
  if (!user) throw new RecordNotFoundError("No issuance record for wallet");
  const recordId = verificationId ?? (await deps.store.findLatestVerifiedRecordId(user.id));
  if (!recordId) throw new RecordNotFoundError("No issuance record for wallet");
  const record = await deps.store.findRecord(recordId);
  if (!record) throw new RecordNotFoundError(`No issuance record ${recordId}`);
  assertRecordOwnedBy(record.userId, user.id, recordId);
  return attemptIssuance(recordId, { ...deps, walletAddress });
}

// Historical sweep helper: verified records whose issuance never confirmed.
// Callers (retry route, future worker) must still run each id through
// attemptIssuance — the claim is what makes resumption safe.
export async function findRecoverableRecordIds(store: IssuanceStore, limit = 50): Promise<string[]> {
  return store.findRecoverableRecordIds(limit);
}

export { attemptsBackoffMs, MAX_ISSUANCE_ATTEMPTS };
