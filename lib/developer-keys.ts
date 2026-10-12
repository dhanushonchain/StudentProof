// Server-side developer API-key management for the self-serve dashboard.
// Only called server-to-server (session-authenticated routes) via lazy
// dynamic import, never from client — same reasoning as lib/business-db.ts.
//
// Every function takes an explicit businessId resolved from the caller's own
// authenticated session: keys are always scoped to the owning business, and
// raw secrets / stored hashes never cross the return boundary except the raw
// secret in the single create-response that carries it once.

import crypto from "crypto";
import { prisma } from "./prisma";
import { hashApiKey } from "./business-db";
import {
  keyPrefixForDisplay,
  toApiKeyStatus,
  validateApiKeyLabel,
  API_KEY_PREFIX,
  type DeveloperApiKeyDTO,
} from "./developer-keys-policy";

export type { DeveloperApiKeyDTO };

export type UsageStats = {
  totalCalls: number;
  callsLast30Days: number;
};

function toDTO(
  row: {
    id: string;
    label: string;
    keyPrefix: string;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
  },
  usageCount: number
): DeveloperApiKeyDTO {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.keyPrefix,
    status: toApiKeyStatus(row.revokedAt),
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    usageCount,
  };
}

// Lists every key the business owns (active and revoked), newest last, with
// per-key usage counts. Revoked keys stay listed for audit — they are never
// deleted.
export async function listBusinessApiKeys(businessId: string): Promise<DeveloperApiKeyDTO[]> {
  const rows = await prisma.businessApiKey.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { usageEvents: true } } },
  });
  return rows.map((row) => toDTO(row, row._count.usageEvents));
}

// Creates a new key and returns its raw secret EXACTLY ONCE — the caller
// (route handler) must relay it to the dashboard response and never persist
// it. Only the SHA-256 hash is stored.
export async function createBusinessApiKey(
  businessId: string,
  label: unknown
): Promise<{ key: DeveloperApiKeyDTO; secret: string }> {
  const cleanLabel = validateApiKeyLabel(label);
  const secret = API_KEY_PREFIX + crypto.randomBytes(32).toString("hex");
  const row = await prisma.businessApiKey.create({
    data: {
      businessId,
      keyHash: hashApiKey(secret),
      keyPrefix: keyPrefixForDisplay(secret),
      label: cleanLabel,
    },
  });
  return { key: toDTO(row, 0), secret };
}

// Revokes a key owned by the business. Idempotent: revoking an already
// revoked key succeeds silently. A key owned by another business is reported
// as not found (null) — no cross-tenant information leak.
export async function revokeBusinessApiKey(businessId: string, keyId: string): Promise<DeveloperApiKeyDTO | null> {
  if (typeof keyId !== "string" || keyId.length === 0) return null;
  const existing = await prisma.businessApiKey.findFirst({
    where: { id: keyId, businessId },
    include: { _count: { select: { usageEvents: true } } },
  });
  if (!existing) return null;
  if (existing.revokedAt) return toDTO(existing, existing._count.usageEvents);
  const row = await prisma.businessApiKey.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  return toDTO(row, existing._count.usageEvents);
}

// Business-level usage statistics for the dashboard header: all-time calls
// (including legacy-key calls) plus a trailing-30-day window.
export async function getBusinessUsageStats(businessId: string): Promise<UsageStats> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [totalCalls, callsLast30Days] = await Promise.all([
    prisma.apiUsageEvent.count({ where: { businessId } }),
    prisma.apiUsageEvent.count({ where: { businessId, timestamp: { gte: since } } }),
  ]);
  return { totalCalls, callsLast30Days };
}
