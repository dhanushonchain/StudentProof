// Database-backed business accounts + API keys for the self-serve B2B
// verification product. Only called server-to-server (API routes) via lazy
// dynamic import, never from client — same reasoning as lib/verification-db.ts.

import crypto from "crypto";
import { prisma } from "./prisma";

const API_KEY_PREFIX = "sp_live_";

function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export type BusinessDTO = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

// Called from auth.ts's jwt callback on every "google-business" sign-in.
// Idempotent by googleSub: a returning business is just looked up (isNew:
// false, apiKey omitted — never re-expose an old raw key). Only a genuinely
// first-time sign-in creates the row and returns a raw key, and that key is
// returned here and ONLY here — it is never stored (only its hash is), so
// this is the one moment it can be shown or emailed.
export async function findOrCreateBusinessForGoogleSignIn({
  googleSub,
  name,
  email,
}: {
  googleSub: string;
  name: string;
  email: string;
}): Promise<{ business: BusinessDTO; apiKey?: string; isNew: boolean }> {
  const existing = await prisma.business.findUnique({ where: { googleSub } });
  if (existing) {
    return {
      business: { id: existing.id, name: existing.name, email: existing.email, createdAt: existing.createdAt.toISOString() },
      isNew: false,
    };
  }

  const apiKey = API_KEY_PREFIX + crypto.randomBytes(32).toString("hex");
  const apiKeyHash = hashApiKey(apiKey);

  try {
    const business = await prisma.business.create({
      data: { googleSub, name, email, apiKeyHash },
    });

    return {
      business: { id: business.id, name: business.name, email: business.email, createdAt: business.createdAt.toISOString() },
      apiKey,
      isNew: true,
    };
  } catch (error) {
    // Two near-simultaneous first sign-ins from the same account both saw
    // "no existing row" and both tried to create one — the second create
    // loses the unique-constraint race. Not an error case: just re-fetch
    // the row the other request created, same as if we'd found it above.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const business = await prisma.business.findUniqueOrThrow({ where: { googleSub } });
      return {
        business: { id: business.id, name: business.name, email: business.email, createdAt: business.createdAt.toISOString() },
        isNew: false,
      };
    }
    throw error;
  }
}

// Called on every incoming request to a key-gated endpoint. Returns null for
// a missing/malformed/unknown key — callers should treat that as 401, not
// distinguish "malformed" from "unknown" (no information leak either way).
export async function authenticateApiKey(rawKey: string): Promise<BusinessDTO | null> {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null;

  const business = await prisma.business.findUnique({ where: { apiKeyHash: hashApiKey(rawKey) } });
  if (!business) return null;

  return { id: business.id, name: business.name, email: business.email, createdAt: business.createdAt.toISOString() };
}

// Fire-and-forget from the caller's perspective — a logging failure must
// never fail the actual verification response it's logging.
export async function logApiUsage(businessId: string): Promise<void> {
  await prisma.apiUsageEvent.create({ data: { businessId } });
}
