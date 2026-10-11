// Pure rate-limit policy for GET /api/verify: mode resolution, key
// derivation, Retry-After math, and safe response bodies. Zero imports —
// safe to unit-test anywhere. The Valkey-backed wiring lives in
// lib/verify-ratelimit.ts; this module never touches the network.

export type RatelimitEnv = {
  storeUrl?: string;
  vercelEnv?: string;
  bypassFlag?: string;
};

// Single source of truth for the Redis key namespace. The wiring module
// reuses this constant so the prefix cannot drift from the keys produced
// by limiterKeyForBusiness below.
export const VERIFY_RATELIMIT_PREFIX = "sp_verify";

export type RatelimitMode = { mode: "enforce" } | { mode: "bypass_dev" } | { mode: "fail_closed" };

// Production and preview must never run without limiting. Local development
// (no Vercel environment) may use the explicit bypass flag — and only then.
// Anything else without Redis configured fails closed.
export function resolveRatelimitMode(env: RatelimitEnv): RatelimitMode {
  const configured = Boolean(env.storeUrl);
  if (configured) return { mode: "enforce" };
  if (env.vercelEnv === "production" || env.vercelEnv === "preview") return { mode: "fail_closed" };
  if (env.bypassFlag === "1") return { mode: "bypass_dev" };
  return { mode: "fail_closed" };
}

// Redis key for one business. The input is the stable business id (cuid),
// never the raw API key — which must not appear in the key either.
export function limiterKeyForBusiness(businessId: string): string {
  return `${VERIFY_RATELIMIT_PREFIX}:${businessId}`;
}

// True when a store URL would connect without TLS. Vercel production and
// preview refuse such URLs (fail closed); local development may use them.
export function isInsecureStoreScheme(url: string): boolean {
  let protocol = "";
  try {
    protocol = new URL(url).protocol;
  } catch {
    return true;
  }
  return protocol !== "rediss:";
}

// Retry-After seconds from a limiter reset timestamp (epoch ms). Always a
// positive integer; missing/invalid/past resets fall back safely.
export const RATELIMIT_FALLBACK_RETRY_AFTER_SEC = 60;

export function retryAfterSeconds(resetMs: number, nowMs: number): number {
  if (!Number.isFinite(resetMs) || !Number.isFinite(nowMs)) return RATELIMIT_FALLBACK_RETRY_AFTER_SEC;
  return Math.max(1, Math.ceil((resetMs - nowMs) / 1000));
}

export function rateLimitExceededBody(): { error: string } {
  return { error: "Rate limit exceeded. Slow down and try again soon." };
}

export function rateLimitUnavailableBody(): { error: string } {
  return { error: "Verification service temporarily unavailable. Try again shortly." };
}

// Minimal limiter surface implemented by the Valkey sliding-window client
// (and by fakes in tests) — deliberately transport-neutral.
export interface RateLimiterLike {
  limit(key: string): Promise<{ success: boolean; reset: number }>;
}

export type RateDecision =
  | { outcome: "allowed" }
  | { outcome: "limited"; retryAfterSec: number }
  | { outcome: "unavailable" };

// Single decision point shared by production wiring and tests: ask the
// limiter once; any throw (store outage, network failure, misconfig at call
// time) becomes fail-closed `unavailable` — never fail-open, never a retry.
export async function evaluateLimitResult(
  limiter: RateLimiterLike,
  businessId: string,
  nowMs: number
): Promise<RateDecision> {
  let result: { success: boolean; reset: number };
  try {
    result = await limiter.limit(limiterKeyForBusiness(businessId));
  } catch {
    return { outcome: "unavailable" };
  }
  if (result.success) return { outcome: "allowed" };
  return { outcome: "limited", retryAfterSec: retryAfterSeconds(result.reset, nowMs) };
}
