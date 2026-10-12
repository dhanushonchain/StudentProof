// Tests for @studentproof/verify. No network: every case injects a mocked
// fetchImpl. Run: `node --test src/index.test.ts` (Node 22.6+ type stripping;
// repo runs Node 26). No test framework, no production traffic.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InvalidApiKeyError,
  InvalidWalletError,
  RateLimitedError,
  StudentProofClient,
  VerificationUnavailableError,
  VerifyTimeoutError,
  isWalletFormat,
  normalizeBaseUrl,
  verifyWallet,
} from "./index.ts";

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const API_KEY = "sp_live_test";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function mockFetch(res: Response, onCall?: (url: string, init: unknown) => void): typeof fetch {
  return (async (url: unknown, init: unknown) => {
    onCall?.(String(url), init);
    return res;
  }) as typeof fetch;
}

const opts = (fetchImpl: typeof fetch, extra = {}) => ({ apiKey: API_KEY, fetchImpl, ...extra });

test("verified wallet returns true; unverified returns false", async () => {
  assert.equal(await verifyWallet(WALLET, opts(mockFetch(jsonResponse(200, { valid: true })))), true);
  assert.equal(await verifyWallet(WALLET, opts(mockFetch(jsonResponse(200, { valid: false })))), false);
});

test("request shape: wallet in query, key in x-api-key header, GET", async () => {
  let seenUrl = "";
  let seenInit: { method?: string; headers?: Record<string, string> } = {};
  await verifyWallet(
    WALLET,
    opts(
      mockFetch(jsonResponse(200, { valid: true }), (url, init) => {
        seenUrl = url;
        seenInit = init as typeof seenInit;
      })
    )
  );
  assert.ok(seenUrl.includes(`/api/verify?wallet=${encodeURIComponent(WALLET)}`));
  assert.equal(seenInit.method, "GET");
  assert.equal(seenInit.headers?.["x-api-key"], API_KEY);
});

test("401 → InvalidApiKeyError", async () => {
  await assert.rejects(
    verifyWallet(WALLET, opts(mockFetch(jsonResponse(401, { error: "Invalid API key." })))),
    InvalidApiKeyError
  );
});

test("400 → InvalidWalletError", async () => {
  await assert.rejects(
    verifyWallet(WALLET, opts(mockFetch(new Response('{"error":"bad"}', { status: 400 })))),
    InvalidWalletError
  );
});

test("malformed and zero addresses throw before any fetch", async () => {
  for (const bad of ["", "not-an-address", "0x123", "0x0000000000000000000000000000000000000000", null, undefined]) {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse(200, { valid: true });
    }) as typeof fetch;
    await assert.rejects(verifyWallet(bad as string, opts(fetchImpl)), InvalidWalletError, String(bad));
    assert.equal(called, false, `no request should fire for ${String(bad)}`);
  }
});

test("429 → RateLimitedError with Retry-After", async () => {
  const err = await verifyWallet(
    WALLET,
    opts(mockFetch(jsonResponse(429, { error: "slow down" }, { "Retry-After": "15" })))
  ).catch((e) => e);
  assert.ok(err instanceof RateLimitedError);
  assert.equal(err.retryAfterSec, 15);
  assert.equal(err.status, 429);
});

test("502/503 → VerificationUnavailableError (fail closed)", async () => {
  for (const status of [502, 503, 500]) {
    await assert.rejects(
      verifyWallet(WALLET, opts(mockFetch(jsonResponse(status, { error: "x" })))),
      (e: unknown) => e instanceof VerificationUnavailableError && (e as VerificationUnavailableError).status === status
    );
  }
});

test("network failure → VerificationUnavailableError; abort → VerifyTimeoutError", async () => {
  const failing = (() => Promise.reject(new Error("socket hang up"))) as typeof fetch;
  await assert.rejects(verifyWallet(WALLET, opts(failing)), VerificationUnavailableError);

  const hanging = ((_url: unknown, init: unknown) =>
    new Promise((_resolve, reject) => {
      (init as { signal?: AbortSignal }).signal?.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
      );
    })) as typeof fetch;
  await assert.rejects(verifyWallet(WALLET, opts(hanging, { timeoutMs: 20 })), VerifyTimeoutError);
});

test("malformed success body → VerificationUnavailableError", async () => {
  await assert.rejects(
    verifyWallet(WALLET, opts(mockFetch(jsonResponse(200, { nope: 1 })))),
    VerificationUnavailableError
  );
  await assert.rejects(
    verifyWallet(WALLET, opts(mockFetch(new Response("not json", { status: 200 })))),
    VerificationUnavailableError
  );
});

test("constructor validates options; base URL normalized", async () => {
  assert.throws(() => new StudentProofClient({ apiKey: "" }), InvalidApiKeyError);
  assert.throws(() => new StudentProofClient({ apiKey: API_KEY, timeoutMs: 0 }), /timeoutMs/);
  assert.equal(normalizeBaseUrl("https://example.com///"), "https://example.com");
  let seenUrl = "";
  const client = new StudentProofClient({
    apiKey: API_KEY,
    baseUrl: "https://example.com/",
    fetchImpl: mockFetch(jsonResponse(200, { valid: true }), (url) => {
      seenUrl = url;
    }),
  });
  assert.equal(await client.verifyWallet(WALLET), true);
  assert.ok(seenUrl.startsWith("https://example.com/api/verify?"));
});

test("isWalletFormat guards the contract", () => {
  assert.equal(isWalletFormat(WALLET), true);
  assert.equal(isWalletFormat("0x0000000000000000000000000000000000000000"), false);
  assert.equal(isWalletFormat("0xZZZ"), false);
  assert.equal(isWalletFormat(42), false);
});
