// Integration-style checks for lib/issuance-orchestrator.ts.
//
// Strategy (no test framework or database is available to this repo):
// - The orchestrator takes ALL collaborators as parameters, so this script
//   drives it with an in-memory FakeStore (faithful compare-and-swap claim)
//   and a scripted FakeChain. No network, no proofs, no funds move.
// - What this proves: lifecycle transitions, eligibility, reconciliation
//   order, single-mint under concurrent attempts *given an atomic claim*,
//   ownership/error/body validation, and historical recovery logic.
// - What it does NOT prove (listed manual checks): that PostgreSQL
//   serializes the single-statement `updateMany` claim across instances
//   (guaranteed by design — one conditional UPDATE — but only a live-DB
//   run can observe it), and any behavior against real Reclaim/Fuji.
// - Run:
//   ./node_modules/.bin/tsc lib/issuance-integration.selfcheck.ts lib/issuance-orchestrator.ts \
//     lib/issuance-policy.ts --outDir /tmp/sp-int-selfcheck --module commonjs --target es2020 \
//     --moduleResolution node --skipLibCheck --strict --esModuleInterop \
//   && node /tmp/sp-int-selfcheck/issuance-integration.selfcheck.js
import assert from "node:assert/strict";
import {
  AlreadyIssuedError,
  assertRecordOwnedBy,
  attemptIssuance,
  AuthorizationError,
  BadRequestError,
  findRecoverableRecordIds,
  parseRetryRequestBody,
  RecordNotFoundError,
  retryIssuanceForWallet,
  type ChainAdapter,
  type IssuanceDeps,
  type IssuanceRecordState,
  type IssuanceStore,
  type ReceiptCheck,
} from "./issuance-orchestrator";
import { MAX_ISSUANCE_ATTEMPTS } from "./issuance-policy";

// --- Fakes ----------------------------------------------------------------

type FakeRecord = IssuanceRecordState;
type FakeCredential = { id: string; contractAddress: string; tokenId: string };

// In-memory store mirroring lib/verification-db.ts's prismaStore semantics,
// including the compare-and-swap claim. JS is single-threaded so the fake's
// claim is trivially atomic; the production claim relies on PostgreSQL
// serializing the single conditional updateMany (see manual checklist).
class FakeStore implements IssuanceStore {
  users = new Map<string, { id: string; wallet: string }>();
  records = new Map<string, FakeRecord>();
  credentials = new Map<string, FakeCredential[]>(); // by userId
  activities: { userId: string; eventType: string }[] = [];
  failSaveOnce = false;

  addUser(id: string, wallet: string) {
    this.users.set(wallet, { id, wallet });
  }

  addVerifiedRecord(id: string, userId: string, overrides: Partial<FakeRecord> = {}): FakeRecord {
    const record: FakeRecord = {
      id,
      userId,
      status: "verified",
      proofReference: "proof-ref",
      issuanceStatus: "not_started",
      issuanceAttempts: 0,
      lastIssuanceError: null,
      mintTxHash: null,
      issuanceUpdatedAt: null,
      verifiedAt: new Date(),
      ...overrides,
    };
    this.records.set(id, record);
    return record;
  }

  async findUserByWallet(wallet: string) {
    return this.users.get(wallet) ?? null;
  }
  // Return copies (like Prisma): callers must never observe another
  // caller's in-flight mutation through a shared reference.
  async findRecord(id: string) {
    const r = this.records.get(id);
    return r ? { ...r } : null;
  }
  async findLatestVerifiedRecordId(userId: string) {
    let latest: FakeRecord | null = null;
    for (const r of this.records.values()) {
      if (r.userId === userId && r.status === "verified") latest = r;
    }
    return latest?.id ?? null;
  }
  async findCredentialByRecord(recordId: string) {
    for (const rows of this.credentials.values()) {
      const hit = rows.find((c) => (c as { recordId?: string }).recordId === recordId);
      if (hit) return { id: hit.id, contractAddress: hit.contractAddress, tokenId: hit.tokenId };
    }
    return null;
  }
  async findCredentialsByUser(userId: string) {
    return (this.credentials.get(userId) ?? []).map((c) => ({
      id: c.id,
      contractAddress: c.contractAddress,
      tokenId: c.tokenId,
    }));
  }
  async findRecoverableRecordIds(limit: number) {
    const ids: string[] = [];
    for (const r of this.records.values()) {
      if (
        r.status === "verified" &&
        (r.issuanceStatus === "not_started" || r.issuanceStatus === "pending" || r.issuanceStatus === "failed") &&
        r.issuanceAttempts < MAX_ISSUANCE_ATTEMPTS
      ) {
        ids.push(r.id);
      }
      if (ids.length >= limit) break;
    }
    return ids;
  }
  async claimIssuance(recordId: string, expectedAttempts: number) {
    const r = this.records.get(recordId);
    if (!r || r.status !== "verified" || r.issuanceAttempts !== expectedAttempts) return false;
    if (r.issuanceStatus !== "not_started" && r.issuanceStatus !== "pending" && r.issuanceStatus !== "failed") {
      return false;
    }
    r.issuanceAttempts = expectedAttempts + 1;
    r.issuanceUpdatedAt = new Date(FakeClock.nowMs());
    return true;
  }
  async markVerifiedPending(recordId: string, proofReference: string) {
    const r = this.records.get(recordId);
    if (!r) throw new RecordNotFoundError(recordId);
    r.status = "verified";
    r.proofReference = proofReference;
    r.verifiedAt = new Date(FakeClock.nowMs());
    r.issuanceStatus = "pending";
    return r;
  }
  async setIssuanceState(recordId: string, state: { status: FakeRecord["issuanceStatus"]; error?: string | null; txHash?: string | null }) {
    const r = this.records.get(recordId);
    if (!r) throw new RecordNotFoundError(recordId);
    r.issuanceStatus = state.status;
    if (state.error !== undefined) r.lastIssuanceError = state.error;
    if (state.txHash !== undefined) r.mintTxHash = state.txHash;
    r.issuanceUpdatedAt = new Date(FakeClock.nowMs());
  }
  async saveIssuedCredential(args: { recordId: string; userId: string; contractAddress: string; tokenId: string; expiresAt: Date }) {
    if (this.failSaveOnce) {
      this.failSaveOnce = false;
      throw new Error("simulated database outage");
    }
    const existing = await this.findCredentialByRecord(args.recordId);
    if (existing) throw new AlreadyIssuedError(`Credential already persisted for record ${args.recordId}`);
    const row = { id: `cred-${args.recordId}`, recordId: args.recordId, contractAddress: args.contractAddress, tokenId: args.tokenId };
    const rows = this.credentials.get(args.userId) ?? [];
    rows.push(row);
    this.credentials.set(args.userId, rows);
    return { id: row.id, contractAddress: row.contractAddress, tokenId: row.tokenId };
  }
  async recordActivity(userId: string, eventType: string) {
    this.activities.push({ userId, eventType });
  }
}

const FakeClock = {
  t: 1_700_000_000_000,
  nowMs() {
    return this.t;
  },
  advance(ms: number) {
    this.t += ms;
  },
};

type MintScript =
  | { mode: "ok" }
  | { mode: "throw"; message: string }
  | { mode: "timeout_after_broadcast" };

class FakeChain implements ChainAdapter {
  mintCalls = 0;
  receiptCalls: string[] = [];
  scanCalls: string[] = [];
  tokenCounter = 100;
  txCounter = 0;
  mintScript: MintScript = { mode: "ok" };
  receipts = new Map<string, ReceiptCheck>();
  // Tokens the scan reports as minted on-chain (simulates a broadcast that
  // landed without the app ever learning its hash).
  ghostMinted: string[] = [];

  async mint() {
    this.mintCalls += 1;
    if (this.mintScript.mode === "throw") throw new Error(this.mintScript.message);
    if (this.mintScript.mode === "timeout_after_broadcast") {
      this.txCounter += 1;
      const tokenId = String(this.tokenCounter);
      this.ghostMinted.push(tokenId);
      throw new Error("eth_getTransactionReceipt timed out after 30000ms");
    }
    this.txCounter += 1;
    const tokenId = String(this.tokenCounter);
    const txHash = `0xtx${this.txCounter}`;
    this.receipts.set(txHash, { found: true, succeeded: true, tokenId });
    return { contractAddress: "0xREGISTRY", tokenId, transactionHash: txHash };
  }

  async getReceipt(txHash: string): Promise<ReceiptCheck> {
    this.receiptCalls.push(txHash);
    return this.receipts.get(txHash) ?? { found: false };
  }

  async findMintedTokenIds(walletAddress: string): Promise<string[]> {
    this.scanCalls.push(walletAddress);
    return [...this.ghostMinted];
  }
}

const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WALLET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function setup() {
  const store = new FakeStore();
  const chain = new FakeChain();
  store.addUser("user-a", WALLET_A);
  store.addUser("user-b", WALLET_B);
  FakeClock.t = 1_700_000_000_000;
  return { store, chain };
}

function depsFor(store: FakeStore, chain: FakeChain, wallet = WALLET_A): IssuanceDeps {
  return {
    store,
    chain,
    walletAddress: wallet,
    providerId: "reclaim",
    contractAddress: "0xREGISTRY",
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    nowMs: () => FakeClock.nowMs(),
  };
}

// --- Cases ------------------------------------------------------------------

async function main() {
  // 1. Valid proof + successful mint -> issued, linked row, activity, 1 attempt.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-1", "user-a");
    const result = await attemptIssuance("rec-1", depsFor(store, chain));
    assert.equal(result.outcome, "issued");
    assert.equal(result.tokenId, "100");
    assert.equal(chain.mintCalls, 1);
    const row = await store.findCredentialByRecord("rec-1");
    assert.ok(row && row.tokenId === "100" && row.contractAddress === "0xREGISTRY");
    assert.ok(store.activities.some((a) => a.eventType === "credential_issued"));
    assert.equal(store.records.get("rec-1")?.issuanceStatus, "issued");
    assert.equal(store.records.get("rec-1")?.issuanceAttempts, 1);
  }

  // 2. Mint failure (timeout) -> verification intact, pending, then recovery.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-2", "user-a");
    chain.mintScript = { mode: "throw", message: "fetch failed: socket hang up" };
    const failed = await attemptIssuance("rec-2", depsFor(store, chain));
    assert.equal(failed.outcome, "ambiguous_pending");
    assert.equal(store.records.get("rec-2")?.status, "verified");
    assert.equal(store.records.get("rec-2")?.issuanceStatus, "pending");
    assert.equal(store.records.get("rec-2")?.lastIssuanceError, "rpc_timeout");
    assert.equal(await store.findCredentialByRecord("rec-2"), null);
    // Immediate retry is lease-blocked (another instance may own it)...
    const early = await attemptIssuance("rec-2", depsFor(store, chain));
    assert.equal(early.outcome, "not_eligible");
    // ...but after lease+backoff with a healthy chain it recovers.
    FakeClock.advance(400_000);
    chain.mintScript = { mode: "ok" };
    const recovered = await attemptIssuance("rec-2", depsFor(store, chain));
    assert.equal(recovered.outcome, "issued");
    assert.equal(chain.mintCalls, 2);
  }

  // 3. Revert -> failed + retryable; retry succeeds.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-3", "user-a");
    chain.mintScript = { mode: "throw", message: "execution reverted: ProviderNotTrusted" };
    const failed = await attemptIssuance("rec-3", depsFor(store, chain));
    assert.equal(failed.outcome, "failed_retryable");
    assert.equal(store.records.get("rec-3")?.lastIssuanceError, "tx_reverted");
    assert.equal(store.records.get("rec-3")?.mintTxHash, null);
    FakeClock.advance(400_000);
    chain.mintScript = { mode: "ok" };
    const retried = await attemptIssuance("rec-3", depsFor(store, chain));
    assert.equal(retried.outcome, "issued");
  }

  // 4. Two concurrent attempts -> exactly one mint; loser contends, no duplicate.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-4", "user-a");
    const [first, second] = await Promise.all([
      attemptIssuance("rec-4", depsFor(store, chain)),
      attemptIssuance("rec-4", depsFor(store, chain)),
    ]);
    assert.equal(chain.mintCalls, 1);
    const outcomes = [first.outcome, second.outcome].sort();
    assert.deepEqual(outcomes, ["contended", "issued"]);
    assert.equal((await store.findCredentialsByUser("user-a")).length, 1);
  }

  // 5. Timeout after broadcast -> retry reconciles via event scan, no second mint.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-5", "user-a");
    chain.mintScript = { mode: "timeout_after_broadcast" };
    const first = await attemptIssuance("rec-5", depsFor(store, chain));
    assert.equal(first.outcome, "ambiguous_pending");
    assert.equal(chain.mintCalls, 1);
    FakeClock.advance(400_000);
    chain.mintScript = { mode: "ok" };
    const second = await attemptIssuance("rec-5", depsFor(store, chain));
    assert.equal(second.outcome, "issued");
    assert.equal(chain.mintCalls, 1, "must adopt the ghost mint, not rebroadcast");
    assert.equal(second.tokenId, "100");
    assert.ok(chain.scanCalls.length >= 1, "event scan must run before any rebroadcast");
  }

  // 6. Mined but DB write failed -> receipt reconciles and repairs the row.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-6", "user-a", { mintTxHash: "0xtx9", issuanceAttempts: 1 });
    chain.receipts.set("0xtx9", { found: true, succeeded: true, tokenId: "777" });
    const result = await attemptIssuance("rec-6", depsFor(store, chain));
    assert.equal(result.outcome, "issued");
    assert.equal(result.tokenId, "777");
    assert.equal(chain.mintCalls, 0);
    const row = await store.findCredentialByRecord("rec-6");
    assert.ok(row && row.tokenId === "777");
  }

  // 7. Receipt shows revert -> failed, hash cleared, next attempt mints fresh.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-7", "user-a", { mintTxHash: "0xtx8", issuanceAttempts: 1 });
    chain.receipts.set("0xtx8", { found: true, succeeded: false, tokenId: null });
    const failed = await attemptIssuance("rec-7", depsFor(store, chain));
    assert.equal(failed.outcome, "failed_retryable");
    assert.equal(store.records.get("rec-7")?.mintTxHash, null);
    FakeClock.advance(400_000);
    const retried = await attemptIssuance("rec-7", depsFor(store, chain));
    assert.equal(retried.outcome, "issued");
    assert.equal(chain.mintCalls, 1, "revert path never broadcasts; one fresh mint");
  }

  // 8. Historical verified record (pre-lifecycle shape) is recoverable.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-8", "user-a"); // issuanceStatus not_started, 0 attempts
    const ids = await findRecoverableRecordIds(store, 50);
    assert.ok(ids.includes("rec-8"));
    const result = await retryIssuanceForWallet(WALLET_A, null, {
      store,
      chain,
      providerId: "reclaim",
      contractAddress: "0xREGISTRY",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      nowMs: () => FakeClock.nowMs(),
    });
    assert.equal(result.outcome, "issued");
  }

  // 9. Existing credential -> never mints again.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-9", "user-a");
    await attemptIssuance("rec-9", depsFor(store, chain));
    assert.equal(chain.mintCalls, 1);
    const again = await attemptIssuance("rec-9", depsFor(store, chain));
    assert.equal(again.outcome, "already_issued");
    assert.equal(chain.mintCalls, 1);
  }

  // 10. Restart: a fresh orchestrator (no memory) resumes persisted state.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-10", "user-a");
    chain.mintScript = { mode: "throw", message: "boom" };
    await attemptIssuance("rec-10", depsFor(store, chain));
    // "Restart": brand-new deps objects, same store contents.
    const freshStore = new FakeStore();
    freshStore.users = store.users;
    freshStore.records = store.records;
    freshStore.credentials = store.credentials;
    freshStore.activities = store.activities;
    const freshChain = new FakeChain();
    FakeClock.advance(400_000);
    const resumed = await attemptIssuance("rec-10", depsFor(freshStore, freshChain));
    assert.equal(resumed.outcome, "issued");
    assert.equal(freshChain.mintCalls, 1);
  }

  // 11. Cross-user retry rejected; unknown record rejected.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-11", "user-a");
    await assert.rejects(
      retryIssuanceForWallet(WALLET_B, "rec-11", {
        store,
        chain,
        providerId: "reclaim",
        contractAddress: "0xREGISTRY",
        expiresAt: new Date(),
        nowMs: () => FakeClock.nowMs(),
      }),
      AuthorizationError
    );
    await assert.rejects(
      retryIssuanceForWallet(WALLET_A, "rec-missing", {
        store,
        chain,
        providerId: "reclaim",
        contractAddress: "0xREGISTRY",
        expiresAt: new Date(),
        nowMs: () => FakeClock.nowMs(),
      }),
      RecordNotFoundError
    );
    assertRecordOwnedBy("user-a", "user-a", "rec-11");
    assert.throws(() => assertRecordOwnedBy("user-a", "user-b", "rec-11"), AuthorizationError);
    assert.throws(() => assertRecordOwnedBy("", "user-a", "rec-11"), AuthorizationError);
  }

  // 12. Malformed bodies rejected; empty shapes default safely.
  {
    assert.deepEqual(parseRetryRequestBody(null), { verificationId: null });
    assert.deepEqual(parseRetryRequestBody(undefined), { verificationId: null });
    assert.deepEqual(parseRetryRequestBody({}), { verificationId: null });
    assert.deepEqual(parseRetryRequestBody({ verificationId: "abc" }), { verificationId: "abc" });
    assert.throws(() => parseRetryRequestBody([]), BadRequestError);
    assert.throws(() => parseRetryRequestBody("x"), BadRequestError);
    assert.throws(() => parseRetryRequestBody({ verificationId: 123 }), BadRequestError);
    assert.throws(() => parseRetryRequestBody({ verificationId: "" }), BadRequestError);
  }

  // 13. Config errors classify cleanly; secret-bearing text never surfaces.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-13", "user-a");
    chain.mintScript = { mode: "throw", message: "MINTER_PRIVATE_KEY environment variable is not set" };
    const failed = await attemptIssuance("rec-13", depsFor(store, chain));
    assert.equal(failed.outcome, "failed_retryable");
    assert.equal(store.records.get("rec-13")?.lastIssuanceError, "config");
    assert.ok(!/MINTER|PRIVATE/i.test(failed.message));
  }

  // 14. No programme information anywhere still issues (mint-gate regression).
  {
    const { store, chain } = setup();
    // The attempt API accepts no programme input at all — a record carrying
    // no programme fields must still reach the mint.
    store.addVerifiedRecord("rec-14", "user-a");
    const result = await attemptIssuance("rec-14", depsFor(store, chain));
    assert.equal(result.outcome, "issued");
    assert.equal(chain.mintCalls, 1);
  }

  // 15. Repeated attempts after issuance never duplicate.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-15", "user-a");
    for (let i = 0; i < 3; i++) {
      const r = await attemptIssuance("rec-15", depsFor(store, chain));
      assert.equal(r.outcome, i === 0 ? "issued" : "already_issued");
    }
    assert.equal(chain.mintCalls, 1);
    assert.equal((await store.findCredentialsByUser("user-a")).length, 1);
  }

  // Exhaustion: attempts cap bounds retries; message stays support-safe.
  {
    const { store, chain } = setup();
    store.addVerifiedRecord("rec-16", "user-a");
    chain.mintScript = { mode: "throw", message: "execution reverted" };
    let last = null;
    for (let i = 0; i < MAX_ISSUANCE_ATTEMPTS + 1; i++) {
      FakeClock.advance(400_000);
      last = await attemptIssuance("rec-16", depsFor(store, chain));
      if (last.outcome === "failed_exhausted") break;
    }
    assert.equal(last?.outcome, "failed_exhausted");
    assert.equal(last?.retryAllowed, false);
    assert.ok(/support/i.test(last?.message ?? ""));
    assert.equal(store.records.get("rec-16")?.status, "verified", "proof stays valid after exhaustion");
  }

  console.log("issuance-integration: all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
