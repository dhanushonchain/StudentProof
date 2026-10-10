// Computes a credential's issuedAt/expiresAt. Every credential expires
// exactly 1 year after issuance, regardless of programme or admission cycle.
export function computeCredentialExpiry(now: Date = new Date()): { issuedAt: Date; expiresAt: Date } {
  const expiresAt = new Date(now);
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
  return { issuedAt: now, expiresAt };
}
