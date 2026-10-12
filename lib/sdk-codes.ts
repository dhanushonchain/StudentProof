// Pure authorization-code lifecycle for SDK v1. Zero imports — the database
// adapter in M2 persists these shapes; tests drive them through an in-memory
// fake with compare-and-swap redemption.
//
// Single-use guarantee has two layers: (1) this logic — a used or expired
// record is never redeemable; (2) the M2 store MUST redeem with one atomic
// conditional write (usedAt IS NULL + id/codeHash match), exactly like the
// issuance claim pattern. A fake cannot prove database atomicity; it proves
// every branch of this layer.
import { generateAuthorizationCode, sha256Hex } from "./sdk-crypto";

export const SDK_CODE_TTL_MS = 10 * 60 * 1000;

export type SdkCodeRecord = {
  id: string;
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAtMs: number;
  usedAtMs: number | null;
};

// Creates the persistable record AND the raw code. The raw code is returned
// to exactly one caller (the authorize endpoint, once, in a redirect) and
// must never be logged or stored — only codeHash survives.
export function buildCodeRecord(args: {
  id: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  nowMs: number;
  ttlMs?: number;
}): { record: SdkCodeRecord; code: string } {
  const code = generateAuthorizationCode();
  return {
    record: {
      id: args.id,
      codeHash: sha256Hex(code),
      clientId: args.clientId,
      userId: args.userId,
      redirectUri: args.redirectUri,
      codeChallenge: args.codeChallenge,
      expiresAtMs: args.nowMs + (args.ttlMs ?? SDK_CODE_TTL_MS),
      usedAtMs: null,
    },
    code,
  };
}

export function isCodeRedeemable(record: SdkCodeRecord, nowMs: number): boolean {
  if (record.usedAtMs !== null) return false;
  return nowMs < record.expiresAtMs;
}

// Pure transition used by stores (real or fake): returns the redeemed record
// or null when redemption is refused. Real stores must additionally guard
// the write atomically (usedAt IS NULL) and treat a zero-row update as a
// lost race, i.e. refused.
export function redeemCodeTransition(record: SdkCodeRecord, nowMs: number): SdkCodeRecord | null {
  if (!isCodeRedeemable(record, nowMs)) return null;
  return { ...record, usedAtMs: nowMs };
}

// Minimal persistence surface for code issuance + redemption. lib/sdk-store
// implements this against Prisma; tests implement it against fakes. The
// atomicity contract: redeemAtomic must consume with ONE conditional write
// (usedAt IS NULL + not expired) and return null on zero matched rows —
// never read-then-write.
export interface SdkCodeStore {
  getByHash(codeHash: string): Promise<SdkCodeRecord | null>;
  redeemAtomic(codeHash: string, nowMs: number): Promise<SdkCodeRecord | null>;
}

// Binding check applied after fetching a code record and before any
// redemption attempt: the presented client (resolved DB id) and redirect
// URI must equal the issuance-time values exactly.
export function codeMatchesBinding(
  record: Pick<SdkCodeRecord, "clientId" | "redirectUri">,
  args: { clientDbId: string; redirectUri: string }
): boolean {
  return record.clientId === args.clientDbId && record.redirectUri === args.redirectUri;
}
