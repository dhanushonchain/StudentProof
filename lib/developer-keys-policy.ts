// Pure helpers for developer API-key management (dashboard + routes).
// Zero imports — safe to unit-test anywhere. Crypto hashing, Prisma access,
// and session checks live in lib/business-db.ts and the route handlers;
// this module only shapes and validates what crosses the client boundary.
//
// Security rules (frozen):
// - Raw secrets and stored hashes NEVER leave the server, except the raw
//   secret in the single create-response that carries it once.
// - The dashboard identifies keys by a non-secret prefix + caller-chosen
//   label, never by hash.
// - Labels are caller-chosen display text: length-capped, no control chars.

export const API_KEY_PREFIX = "sp_live_";
export const API_KEY_LABEL_MAX_LENGTH = 60;

export type ApiKeyStatus = "active" | "revoked";

// What the dashboard list endpoint returns per key. Deliberately excludes
// the hash and any secret material.
export type DeveloperApiKeyDTO = {
  id: string;
  label: string;
  keyPrefix: string;
  status: ApiKeyStatus;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
};

// Caller-supplied label validation. Returns the trimmed label, or throws a
// plain Error with a display-safe message (no secrets involved).
export function validateApiKeyLabel(value: unknown): string {
  if (typeof value !== "string") throw new Error("Label must be a string.");
  const label = value.trim();
  if (label.length === 0) throw new Error("Label must not be empty.");
  if (label.length > API_KEY_LABEL_MAX_LENGTH) {
    throw new Error(`Label must be at most ${API_KEY_LABEL_MAX_LENGTH} characters.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(label)) throw new Error("Label contains invalid characters.");
  return label;
}

// Non-secret dashboard identifier: the raw key's own leading characters.
export function keyPrefixForDisplay(rawKey: string): string {
  return rawKey.slice(0, 12);
}

export function toApiKeyStatus(revokedAt: Date | string | null | undefined): ApiKeyStatus {
  return revokedAt ? "revoked" : "active";
}
