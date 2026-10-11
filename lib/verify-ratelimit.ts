// Valkey-backed wiring for GET /api/verify rate limiting. Server-only:
// imported lazily by the route, like the other Node-only modules.
//
// Flow: mode resolution (fail-closed unless explicitly bypassed in local
// dev) -> lazy singleton client -> single atomic sliding-window check. The
// route maps outcomes to 429 / 503 / pass-through; this module never builds
// HTTP responses and never touches the chain.
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import {
  evaluateLimitResult,
  isInsecureStoreScheme,
  limiterKeyForBusiness,
  resolveRatelimitMode,
  type RateDecision,
  type RateLimiterLike,
} from "./verify-ratelimit-policy";
import { safeChainErrorLog } from "./verify-request";

export const VERIFY_RATELIMIT_WINDOW_MS = 60_000;
export const VERIFY_RATELIMIT_MAX_REQUESTS = 60;
export const VERIFY_RATELIMIT_DEV_BYPASS_WARNING =
  "[Verify] Rate limiting DISABLED via explicit local-dev bypass (VERIFY_RATELIMIT_BYPASS=1). Never set this on Vercel.";

// Sliding window in ONE Lua script (EVAL): prune expired entries, count,
// admit-or-reject, set TTL. Atomicity comes from Redis executing the script
// single-threadedly — concurrent serverless instances cannot interleave
// inside it, so the 60/minute bound holds cluster-wide. Returns
// [allowed 1/0, resetEpochMs] where reset is the oldest retained entry +
// window (0 when admitted).
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now_ms - window_ms)
local count = redis.call('ZCARD', key)
if count < max_requests then
  redis.call('ZADD', key, now_ms, member)
  redis.call('PEXPIRE', key, window_ms)
  return {1, 0}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, tonumber(oldest[2]) + window_ms}
end
`;

export class ValkeySlidingWindow implements RateLimiterLike {
  constructor(
    private readonly redis: Pick<Redis, "eval">,
    private readonly windowMs: number = VERIFY_RATELIMIT_WINDOW_MS,
    private readonly maxRequests: number = VERIFY_RATELIMIT_MAX_REQUESTS
  ) {}

  async limit(key: string): Promise<{ success: boolean; reset: number }> {
    const nowMs = Date.now();
    const member = `${nowMs}:${randomUUID()}`;
    const raw = (await this.redis.eval(SLIDING_WINDOW_LUA, 1, key, String(nowMs), String(this.windowMs), String(this.maxRequests), member)) as
      | [number, number]
      | null
      | undefined;
    if (!Array.isArray(raw) || typeof raw[0] !== "number" || typeof raw[1] !== "number") {
      throw new Error("Rate limiter returned an unexpected response shape");
    }
    return { success: raw[0] === 1, reset: raw[1] };
  }
}

// Lazy singleton: construction is cheap but must not run at import time
// (env may be absent during builds). One client per serverless instance,
// reused across warm invocations — never connected per request (that would
// exhaust the server's connection limit) and never quit after use.
let cachedClient: Redis | null | undefined;

function getVerifyRedis(): Redis | null {
  if (cachedClient !== undefined) return cachedClient;
  const url = process.env.VALKEY_URL;
  if (!url) {
    cachedClient = null;
    return null;
  }
  // ioredis enables TLS automatically for rediss:// using system root CAs.
  // Verified live: Aiven Valkey presents a public Let's Encrypt chain, NOT
  // the project CA that Aiven Postgres needs pinned — so no custom `tls`
  // config here. Plain redis:// URLs stay unencrypted (local dev only).
  let client: Redis;
  try {
    client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
      commandTimeout: 5000,
      connectTimeout: 5000,
    });
  } catch (error) {
    // Malformed URL or synchronous construction failure: fail closed on the
    // next check via a null client, with a sanitized one-liner for operators.
    console.error("[Verify] Rate-limit store misconfigured:", safeChainErrorLog(error));
    cachedClient = null;
    return null;
  }
  // Swallow connection-level 'error' events with a redacted one-liner.
  // Without a listener these print raw internals (host, and potentially
  // URL fragments) to stderr; command failures still reject and flow into
  // the fail-closed path below, so nothing operational is lost.
  client.on("error", (error: unknown) => {
    console.error("[Verify] Rate-limit connection error:", safeChainErrorLog(error));
  });
  cachedClient = client;
  return cachedClient;
}

// With lazyConnect + offline queue off, the first command would reject
// before the socket exists — so gate every check on a shared connect
// promise instead. Concurrent callers share it; a failure rejects all of
// them into fail-closed and resets, so the next request retries fresh.
let connectPromise: Promise<void> | null = null;

async function ensureConnected(redis: Redis): Promise<void> {
  if (redis.status === "ready") return;
  if (!connectPromise) {
    connectPromise = redis
      .connect()
      .then(() => undefined)
      .finally(() => {
        connectPromise = null;
      });
  }
  await connectPromise;
}

export type VerifyRateCheck = RateDecision | { outcome: "bypass_dev" };

// Decides one request. Never throws for missing config (fail-closed
// `unavailable` instead) and never exposes credentials: the connection URL
// stays inside the client; failures log a redacted one-liner.
export async function checkVerifyRateLimit(businessId: string): Promise<VerifyRateCheck> {
  const mode = resolveRatelimitMode({
    storeUrl: process.env.VALKEY_URL,
    vercelEnv: process.env.VERCEL_ENV,
    bypassFlag: process.env.VERIFY_RATELIMIT_BYPASS,
  });

  if (mode.mode === "bypass_dev") {
    console.warn(VERIFY_RATELIMIT_DEV_BYPASS_WARNING);
    return { outcome: "bypass_dev" };
  }
  if (mode.mode === "fail_closed") {
    return { outcome: "unavailable" };
  }

  // Vercel production/preview must only ever talk to the store over TLS.
  // A plaintext URL there fails closed instead of leaking the AUTH secret
  // on the wire. Local development may use plain redis://.
  const vercelEnv = process.env.VERCEL_ENV;
  const storeUrl = process.env.VALKEY_URL ?? "";
  if ((vercelEnv === "production" || vercelEnv === "preview") && isInsecureStoreScheme(storeUrl)) {
    console.error("[Verify] Refusing plaintext Valkey URL in a Vercel environment.");
    return { outcome: "unavailable" };
  }

  const redis = getVerifyRedis();
  if (!redis) return { outcome: "unavailable" };

  try {
    await ensureConnected(redis);
    const limiter = new ValkeySlidingWindow(redis);
    return await evaluateLimitResult(limiter, businessId, Date.now());
  } catch (error) {
    // evaluateLimitResult already converts limiter throws to `unavailable`;
    // this guards only against unexpected failures in our own plumbing.
    // Close a broken connection so the next request starts fresh instead
    // of reusing a half-open socket; error is swallowed (disconnect never
    // throws usefully here).
    try {
      redis.disconnect();
    } catch {
      // ignore
    }
    cachedClient = undefined;
    console.error("[Verify] Rate-limit check failed:", safeChainErrorLog(error));
    return { outcome: "unavailable" };
  }
}

// Key helper re-export for tests/operators: the Redis key is namespaced and
// derived from the business id only — the raw API key never appears in it.
export { limiterKeyForBusiness };
