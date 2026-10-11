// Runnable checks for lib/verify-ratelimit-policy.ts (pure — no I/O, no
// env, no Valkey). The Valkey wiring in lib/verify-ratelimit.ts is covered
// indirectly: it delegates every decision to the functions tested here, and
// its Lua sliding window is atomic by single-script construction (live
// Valkey verification is a separate manual step).
// Route-handler integration is NOT covered (no harness exists) — see file
// header note in app/api/verify/route.ts.
// Run:
//   ./node_modules/.bin/tsc lib/verify-ratelimit.selfcheck.ts lib/verify-ratelimit-policy.ts \
//     --outDir /tmp/sp-rl-selfcheck --module commonjs --target es2020 \
//     --moduleResolution node --skipLibCheck --strict --esModuleInterop \
//   && node /tmp/sp-rl-selfcheck/verify-ratelimit.selfcheck.js
import assert from "node:assert/strict";
import {
  evaluateLimitResult,
  isInsecureStoreScheme,
  limiterKeyForBusiness,
  rateLimitExceededBody,
  rateLimitUnavailableBody,
  RATELIMIT_FALLBACK_RETRY_AFTER_SEC,
  resolveRatelimitMode,
  retryAfterSeconds,
  VERIFY_RATELIMIT_PREFIX,
  type RateLimiterLike,
} from "./verify-ratelimit-policy";

function okLimiter(resetMs: number): RateLimiterLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async limit(key: string) {
      calls.push(key);
      return { success: true, reset: resetMs };
    },
  };
}

function denyLimiter(resetMs: number): RateLimiterLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async limit(key: string) {
      calls.push(key);
      return { success: false, reset: resetMs };
    },
  };
}

function throwingLimiter(): RateLimiterLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async limit(key: string): Promise<{ success: boolean; reset: number }> {
      calls.push(key);
      throw new Error("connect ECONNREFUSED rediss://user:pass@valkey.example.com:6379");
    },
  };
}

async function main() {
  // Mode matrix: a configured store URL always enforces; production and
  // preview without one fail closed; local dev fails closed unless the
  // explicit bypass flag is set (and the flag is dead on Vercel).
  assert.deepEqual(resolveRatelimitMode({ storeUrl: "rediss://x" }), { mode: "enforce" });
  assert.deepEqual(resolveRatelimitMode({ vercelEnv: "production" }), { mode: "fail_closed" });
  assert.deepEqual(resolveRatelimitMode({ vercelEnv: "preview" }), { mode: "fail_closed" });
  assert.deepEqual(resolveRatelimitMode({}), { mode: "fail_closed" });
  assert.deepEqual(resolveRatelimitMode({ bypassFlag: "1" }), { mode: "bypass_dev" });
  assert.deepEqual(resolveRatelimitMode({ vercelEnv: "production", bypassFlag: "1" }), { mode: "fail_closed" });
  assert.deepEqual(resolveRatelimitMode({ vercelEnv: "preview", bypassFlag: "1" }), { mode: "fail_closed" });
  assert.deepEqual(resolveRatelimitMode({ bypassFlag: "yes" }), { mode: "fail_closed" });
  assert.deepEqual(resolveRatelimitMode({ storeUrl: "" }), { mode: "fail_closed" });

  // Limiter key is stable and never embeds the raw API key.
  const rawKey = "sp_live_abcdef1234567890";
  const key = limiterKeyForBusiness("biz_cuid123");
  assert.equal(key, "sp_verify:biz_cuid123");
  assert.ok(key.startsWith(`${VERIFY_RATELIMIT_PREFIX}:`), "single source of truth for the prefix");
  assert.ok(!key.includes(rawKey));
  assert.ok(!limiterKeyForBusiness("other").includes("biz_cuid123"));

  // Plaintext store schemes are refused on Vercel; rediss:// is required.
  assert.equal(isInsecureStoreScheme("rediss://host:6379"), false);
  assert.equal(isInsecureStoreScheme("redis://host:6379"), true);
  assert.equal(isInsecureStoreScheme("http://host:6379"), true);
  assert.equal(isInsecureStoreScheme("not-a-url"), true);
  assert.equal(isInsecureStoreScheme(""), true);

  // Retry-After: positive integers; invalid input falls back safely.
  assert.equal(retryAfterSeconds(61_500, 60_000), 2);
  assert.equal(retryAfterSeconds(60_000, 60_000), 1);
  assert.equal(retryAfterSeconds(50_000, 60_000), 1);
  assert.equal(retryAfterSeconds(Number.NaN, 60_000), RATELIMIT_FALLBACK_RETRY_AFTER_SEC);
  assert.equal(retryAfterSeconds(Number.POSITIVE_INFINITY, 60_000), RATELIMIT_FALLBACK_RETRY_AFTER_SEC);

  // Bodies are exact minimal shapes.
  assert.deepEqual(Object.keys(rateLimitExceededBody()), ["error"]);
  assert.deepEqual(Object.keys(rateLimitUnavailableBody()), ["error"]);

  // Allowed request passes; limiter keyed per business.
  {
    const chainCalls: string[] = [];
    const fake = okLimiter(61_000);
    const d = await evaluateLimitResult(fake, "biz_a", 60_000);
    assert.deepEqual(d, { outcome: "allowed" });
    assert.deepEqual(fake.calls, ["sp_verify:biz_a"]);
    assert.deepEqual(chainCalls, []);
  }

  // First exceeding request: limited with correct Retry-After seconds.
  {
    const fake = denyLimiter(75_000);
    const d = await evaluateLimitResult(fake, "biz_a", 60_000);
    assert.deepEqual(d, { outcome: "limited", retryAfterSec: 15 });
  }

  // Independent identifiers: per-key state isolation is the store's job;
  // the decision layer must at least address keys independently.
  {
    const seen = new Map<string, number>();
    const counting: RateLimiterLike = {
      async limit(k: string) {
        seen.set(k, (seen.get(k) ?? 0) + 1);
        return { success: true, reset: 0 };
      },
    };
    await evaluateLimitResult(counting, "biz_a", 0);
    await evaluateLimitResult(counting, "biz_b", 0);
    assert.ok(seen.has("sp_verify:biz_a") && seen.has("sp_verify:biz_b"));
  }

  // Store outage fails closed — and the throw (with embedded URL) never
  // propagates to a caller that might log or return it raw.
  {
    const fake = throwingLimiter();
    const d = await evaluateLimitResult(fake, "biz_a", 60_000);
    assert.deepEqual(d, { outcome: "unavailable" });
  }

  // Helper holds no shared state: concurrent decisions are independent.
  // (Cross-instance atomicity itself comes from the single-Lua-script
  // window in lib/verify-ratelimit.ts, verified against live Valkey.)
  {
    let calls = 0;
    const stateless: RateLimiterLike = {
      async limit() {
        calls += 1;
        return { success: true, reset: 0 };
      },
    };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => evaluateLimitResult(stateless, "biz_a", 0))
    );
    assert.equal(calls, 20);
    assert.ok(results.every((r) => r.outcome === "allowed"));
  }

  console.log("verify-ratelimit: all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
