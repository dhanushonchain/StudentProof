// Prisma-backed SDK v1 store: client lookup, code issuance persistence, and
// atomic single-use redemption. Only called server-to-server (SDK routes)
// via lazy dynamic import, never from client — same Edge-safety reasoning
// as lib/verification-db.ts (Prisma's Node-only engine).
//
// Privacy: getClientByClientId deliberately excludes clientSecretHash, and
// no function here logs anything — callers log ids and outcomes only.

import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { buildCodeRecord, type SdkCodeRecord, type SdkCodeStore } from "./sdk-codes";
import { generateClientSecret, sha256Hex } from "./sdk-crypto";
import { toOAuthClientDTO, type DeveloperOAuthClientDTO } from "./sdk-client-policy";

export type SdkClientPublic = {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
};

export async function getSdkClientByClientId(clientId: string): Promise<SdkClientPublic | null> {
  const client = await prisma.sdkClient.findUnique({
    where: { clientId },
    select: { id: true, clientId: true, name: true, redirectUris: true, revokedAt: true },
  });
  if (!client || client.revokedAt) return null;
  return {
    id: client.id,
    clientId: client.clientId,
    name: client.name,
    redirectUris: client.redirectUris,
  };
}

export async function findSdkUserByWallet(walletAddress: string): Promise<{ id: string } | null> {
  return prisma.user.findUnique({ where: { walletAddress }, select: { id: true } });
}

// Minimal wallet lookup for token-time credential re-evaluation: address
// only, never email or Google identifiers.
export async function getSdkUserWallet(userId: string): Promise<{ address: string } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { walletAddress: true } });
  return user ? { address: user.walletAddress } : null;
}

// Secret-hash lookup for client authentication. Returns the hash alone so
// callers compare without ever loading names, URIs, or other client fields
// alongside it — and the raw secret, of course, exists nowhere to load.
export async function getSdkClientSecretHash(clientDbId: string): Promise<string | null> {
  const client = await prisma.sdkClient.findUnique({
    where: { id: clientDbId },
    select: { clientSecretHash: true, revokedAt: true },
  });
  if (!client || client.revokedAt) return null;
  return client.clientSecretHash;
}

export function generateRandomClientId(): string {
  return `sp_client_${randomBytes(16).toString("hex")}`;
}

export async function listSdkClientsForBusiness(businessId: string): Promise<DeveloperOAuthClientDTO[]> {
  const rows = await prisma.sdkClient.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      clientId: true,
      name: true,
      websiteUrl: true,
      redirectUris: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return rows.map(toOAuthClientDTO);
}

export async function createSdkClientForBusiness(args: {
  businessId: string;
  name: string;
  websiteUrl: string;
  redirectUris: string[];
}): Promise<{ client: DeveloperOAuthClientDTO; secret: string }> {
  const clientId = generateRandomClientId();
  const rawSecret = generateClientSecret();
  const clientSecretHash = sha256Hex(rawSecret);

  const row = await prisma.sdkClient.create({
    data: {
      clientId,
      clientSecretHash,
      name: args.name,
      websiteUrl: args.websiteUrl,
      businessId: args.businessId,
      redirectUris: args.redirectUris,
    },
    select: {
      id: true,
      clientId: true,
      name: true,
      websiteUrl: true,
      redirectUris: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return { client: toOAuthClientDTO(row), secret: rawSecret };
}

export async function updateSdkClientRedirectUris(args: {
  businessId: string;
  id: string;
  redirectUris?: string[];
  websiteUrl?: string;
}): Promise<DeveloperOAuthClientDTO | null> {
  const existing = await prisma.sdkClient.findFirst({
    where: {
      businessId: args.businessId,
      OR: [{ id: args.id }, { clientId: args.id }],
    },
  });
  if (!existing) return null;
  if (existing.revokedAt) {
    throw new Error("Cannot update a revoked application.");
  }

  const updated = await prisma.sdkClient.update({
    where: { id: existing.id },
    data: {
      ...(args.redirectUris !== undefined ? { redirectUris: args.redirectUris } : {}),
      ...(args.websiteUrl !== undefined ? { websiteUrl: args.websiteUrl } : {}),
    },
    select: {
      id: true,
      clientId: true,
      name: true,
      websiteUrl: true,
      redirectUris: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return toOAuthClientDTO(updated);
}

export async function rotateSdkClientSecret(args: {
  businessId: string;
  id: string;
}): Promise<{ client: DeveloperOAuthClientDTO; secret: string } | null> {
  const existing = await prisma.sdkClient.findFirst({
    where: {
      businessId: args.businessId,
      OR: [{ id: args.id }, { clientId: args.id }],
    },
  });
  if (!existing) return null;
  if (existing.revokedAt) {
    throw new Error("Cannot rotate secrets for a revoked application.");
  }

  const newSecret = generateClientSecret();
  const updated = await prisma.sdkClient.update({
    where: { id: existing.id },
    data: { clientSecretHash: sha256Hex(newSecret) },
    select: {
      id: true,
      clientId: true,
      name: true,
      websiteUrl: true,
      redirectUris: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return { client: toOAuthClientDTO(updated), secret: newSecret };
}

export async function revokeSdkClient(args: {
  businessId: string;
  id: string;
}): Promise<DeveloperOAuthClientDTO | null> {
  const existing = await prisma.sdkClient.findFirst({
    where: {
      businessId: args.businessId,
      OR: [{ id: args.id }, { clientId: args.id }],
    },
  });
  if (!existing) return null;
  if (existing.revokedAt) {
    return toOAuthClientDTO(existing);
  }

  const updated = await prisma.sdkClient.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
    select: {
      id: true,
      clientId: true,
      name: true,
      websiteUrl: true,
      redirectUris: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return toOAuthClientDTO(updated);
}

function toCodeRecord(row: {
  id: string;
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: Date;
  usedAt: Date | null;
}): SdkCodeRecord {
  return {
    id: row.id,
    codeHash: row.codeHash,
    clientId: row.clientId,
    userId: row.userId,
    redirectUri: row.redirectUri,
    codeChallenge: row.codeChallenge,
    expiresAtMs: row.expiresAt.getTime(),
    usedAtMs: row.usedAt ? row.usedAt.getTime() : null,
  };
}

// Issues a code: generates the raw value, persists ONLY its hash, and
// returns both. The raw code must travel exactly once (authorize redirect)
// and never be stored or logged.
export async function issueSdkCode(args: {
  userId: string;
  clientDbId: string;
  redirectUri: string;
  codeChallenge: string;
  nowMs?: number;
}): Promise<{ record: SdkCodeRecord; code: string }> {
  const nowMs = args.nowMs ?? Date.now();
  const { record, code } = buildCodeRecord({
    id: randomUUID(),
    userId: args.userId,
    clientId: args.clientDbId,
    redirectUri: args.redirectUri,
    codeChallenge: args.codeChallenge,
    nowMs,
  });
  const row = await prisma.sdkAuthCode.create({
    data: {
      id: record.id,
      codeHash: record.codeHash,
      clientId: record.clientId,
      userId: record.userId,
      redirectUri: record.redirectUri,
      codeChallenge: record.codeChallenge,
      expiresAt: new Date(record.expiresAtMs),
    },
  });
  return { record: toCodeRecord(row), code };
}

export const sdkCodeStore: SdkCodeStore = {
  async getByHash(codeHash: string) {
    const row = await prisma.sdkAuthCode.findUnique({ where: { codeHash } });
    return row ? toCodeRecord(row) : null;
  },

  // Single conditional write: consumes only when still unused and unexpired.
  // Zero matched rows (lost race, replay, or expiry) return null — the
  // caller must treat that as refused, never fall back to a second write.
  async redeemAtomic(codeHash: string, nowMs: number) {
    const { count } = await prisma.sdkAuthCode.updateMany({
      where: { codeHash, usedAt: null, expiresAt: { gt: new Date(nowMs) } },
      data: { usedAt: new Date(nowMs) },
    });
    if (count !== 1) return null;
    const row = await prisma.sdkAuthCode.findUniqueOrThrow({ where: { codeHash } });
    return toCodeRecord(row);
  },
};
