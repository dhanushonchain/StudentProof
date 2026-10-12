// Tests for @studentproof/oauth. No network: every case injects a mocked
// fetchImpl. Run: `node --test src/index.test.ts` (Node 22.6+ type stripping;
// repo runs Node 26). Ed25519 vectors are generated in-test with node:crypto
// and verified against the live JWKS-shape fixtures below — no fixture keys
// are shared with any environment. No production traffic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import {
  buildAuthorizeUrl,
  createPkcePair,
  exchangeAuthorizationCode,
  generateState,
  InvalidAssertionError,
  InvalidClientError,
  InvalidGrantError,
  InvalidRequestError,
  RateLimitedError,
  StudentProofOAuthError,
  VerificationUnavailableError,
} from "./index.ts";
import { verifyStudentAssertion } from "./server.ts";

const BASE = "https://verify.test";
const CLIENT_ID = "sp_client_demo0000000000";
const REDIRECT_URI = "https://app.test/auth/callback";
const ISS = "https://verify.test";

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

// --- authorize URL + PKCE/state (browser-safe entry) ---

test("buildAuthorizeUrl produces the exact connect URL", () => {
  const url = buildAuthorizeUrl({
    baseUrl: BASE,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    state: "s1",
    codeChallenge: "c1",
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, `${BASE}/sdk/connect`);
  assert.equal(parsed.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(parsed.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(parsed.searchParams.get("state"), "s1");
  assert.equal(parsed.searchParams.get("mode"), "signin");
  assert.equal(parsed.searchParams.get("code_challenge"), "c1");
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    buildAuthorizeUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state: "s", codeChallenge: "c", mode: "signup" }).includes("mode=signup"),
    true
  );
});

test("buildAuthorizeUrl rejects malformed inputs", () => {
  const good = { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state: "s", codeChallenge: "c" };
  assert.throws(() => buildAuthorizeUrl({ ...good, clientId: "" }), StudentProofOAuthError);
  assert.throws(() => buildAuthorizeUrl({ ...good, state: "" }), StudentProofOAuthError);
  assert.throws(() => buildAuthorizeUrl({ ...good, state: "x".repeat(501) }), StudentProofOAuthError);
  assert.throws(() => buildAuthorizeUrl({ ...good, mode: "login" as "signin" }), StudentProofOAuthError);
});

test("generateState + createPkcePair follow provider rules", async () => {
  const s1 = generateState();
  const s2 = generateState();
  assert.ok(s1.length >= 22 && s2.length >= 22 && s1 !== s2);
  const { verifier, challenge } = await createPkcePair();
  assert.ok(verifier.length >= 43 && verifier.length <= 128);
  assert.ok(/^[A-Za-z0-9\-_]+$/.test(verifier));
  const expected = createHash("sha256").update(verifier, "ascii").digest("base64url");
  assert.equal(challenge, expected);
});

// --- token exchange (server-side) ---

const EX = { baseUrl: BASE, code: "code-1", redirectUri: REDIRECT_URI, clientId: CLIENT_ID, clientSecret: "sp_sk_test", codeVerifier: "verifier-1" };

test("exchange posts form-encoded body and returns the assertion", async () => {
  let seenUrl = "";
  let seenInit: { method?: string; headers?: Record<string, string>; body?: URLSearchParams } = {};
  const out = await exchangeAuthorizationCode({
    ...EX,
    fetchImpl: mockFetch(jsonResponse(200, { assertion: "a.b.c.d", expires_in: 300 }), (url, init) => {
      seenUrl = url;
      seenInit = init as typeof seenInit;
    }),
  });
  assert.deepEqual(out, { assertion: "a.b.c.d", expiresIn: 300 });
  assert.equal(seenUrl, `${BASE}/api/sdk/token`);
  assert.equal(seenInit.method, "POST");
  assert.ok((seenInit.headers?.["content-type"] ?? "").includes("application/x-www-form-urlencoded"));
  const body = new URLSearchParams(String(seenInit.body));
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("client_secret"), "sp_sk_test");
  assert.ok(!String(seenInit.body).includes("clientSecret"));
});

test("exchange maps every failure status to a typed error", async () => {
  const e = { ...EX };
  await assert.rejects(exchangeAuthorizationCode({ ...e, fetchImpl: mockFetch(jsonResponse(401, { error: "invalid_client" })) }), InvalidClientError);
  await assert.rejects(exchangeAuthorizationCode({ ...e, fetchImpl: mockFetch(jsonResponse(400, { error: "invalid_grant" })) }), InvalidGrantError);
  await assert.rejects(exchangeAuthorizationCode({ ...e, fetchImpl: mockFetch(jsonResponse(400, { error: "invalid_request" })) }), InvalidRequestError);
  const limited = await exchangeAuthorizationCode({ ...e, fetchImpl: mockFetch(jsonResponse(429, { error: "slow down" }, { "Retry-After": "17" })) }).catch((err) => err);
  assert.ok(limited instanceof RateLimitedError && limited.retryAfterSec === 17);
  await assert.rejects(exchangeAuthorizationCode({ ...e, fetchImpl: mockFetch(jsonResponse(502, { error: "x" })) }), VerificationUnavailableError);
  await assert.rejects(exchangeAuthorizationCode({ ...e, fetchImpl: mockFetch(jsonResponse(503, { error: "x" })) }), VerificationUnavailableError);
  await assert.rejects(exchangeAuthorizationCode({ ...e, fetchImpl: mockFetch(jsonResponse(200, { nope: 1 })) }), VerificationUnavailableError);
  await assert.rejects(exchangeAuthorizationCode({ ...e, codeVerifier: "" }), InvalidRequestError);
  await assert.rejects(
    exchangeAuthorizationCode({ ...e, fetchImpl: (async () => { throw new Error("down"); }) as typeof fetch }),
    VerificationUnavailableError
  );
  await assert.rejects(
    exchangeAuthorizationCode({ ...e, timeoutMs: 20, fetchImpl: ((_url: unknown, init: unknown) => new Promise((_resolve, reject) => {
      (init as { signal?: AbortSignal }).signal?.addEventListener("abort", () => reject(Object.assign(new Error("x"), { name: "AbortError" })));
    })) as typeof fetch }),
    VerificationUnavailableError
  );
});

// --- assertion verification (server entry, live crypto) ---

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function mintFixture(opts: { verified: boolean; aud?: string; iss?: string; iat?: number; exp?: number; kid?: string; key?: KeyObject }) {
  const privateKey = opts.key ?? generateKeyPairSync("ed25519").privateKey;
  const jwk = mintFixtureJwk(privateKey);
  const kid = opts.kid ?? "kid-test-1";
  const now = 1_700_000_000;
  const payload = {
    v: 2,
    iss: opts.iss ?? ISS,
    sub: "pairwise-subject-1",
    aud: opts.aud ?? CLIENT_ID,
    vb: opts.verified,
    iat: opts.iat ?? now,
    exp: opts.exp ?? now + 300,
  };
  const payloadB64 = b64urlJson(payload);
  const sig = sign(null, Buffer.from(`sp-sdk-assertion-v2.${kid}.${payloadB64}`, "utf8"), privateKey).toString("base64url");
  return { assertion: `v2.${kid}.${payloadB64}.${sig}`, jwk, kid, now };
}

function mintFixtureJwk(privateKey: KeyObject) {
  // Derive the public JWK from the private key, keeping { kty, crv, x }.
  const exported = createPublicKey(privateKey).export({ format: "jwk" });
  return { kty: "OKP", crv: "Ed25519", x: exported.x as string };
}

function jwksResponse(keys: unknown[]): Response {
  return jsonResponse(200, { keys });
}

test("valid true/false assertions verify against the JWKS", async () => {
  for (const verified of [true, false]) {
    const f = mintFixture({ verified });
    const out = await verifyStudentAssertion({
      baseUrl: BASE,
      assertion: f.assertion,
      expectedAud: CLIENT_ID,
      expectedIss: ISS,
      nowSec: f.now,
      fetchImpl: mockFetch(jwksResponse([{ ...f.jwk, kid: f.kid, use: "sig", alg: "EdDSA" }])),
    });
    assert.deepEqual(out, { valid: verified, sub: "pairwise-subject-1" });
  }
});

test("tampered payload, wrong kid/aud/iss, lifetime violations fail", async () => {
  const f = mintFixture({ verified: true });
  const good = { baseUrl: BASE, assertion: f.assertion, expectedAud: CLIENT_ID, expectedIss: ISS, nowSec: f.now };
  const entry = { ...f.jwk, kid: f.kid };
  const jwks = (async () => jwksResponse([entry])) as typeof fetch;
  const segs = f.assertion.split(".");
  const tamperedPayload = [segs[0], segs[1], b64urlJson({ v: 2, iss: ISS, sub: "mallory", aud: CLIENT_ID, vb: true, iat: f.now, exp: f.now + 300 }), segs[3]].join(".");
  await assert.rejects(verifyStudentAssertion({ ...good, assertion: tamperedPayload, fetchImpl: jwks }), InvalidAssertionError);
  await assert.rejects(verifyStudentAssertion({ ...good, expectedAud: "sp_client_other00000000", fetchImpl: jwks }), InvalidAssertionError);
  await assert.rejects(verifyStudentAssertion({ ...good, expectedIss: "https://evil.test", fetchImpl: jwks }), InvalidAssertionError);
  await assert.rejects(verifyStudentAssertion({ ...good, nowSec: f.now + 361, fetchImpl: jwks }), InvalidAssertionError);
  await assert.rejects(verifyStudentAssertion({ ...good, assertion: "garbage", fetchImpl: jwks }), InvalidAssertionError);
  await assert.rejects(verifyStudentAssertion({ ...good, assertion: "v1.a.b", fetchImpl: jwks }), InvalidAssertionError);
});

test("unknown kid refreshes the JWKS once (rotation overlap)", async () => {
  const f = mintFixture({ verified: true });
  const entry = { ...f.jwk, kid: f.kid };
  let calls = 0;
  const rotating = (async () => {
    calls += 1;
    return jwksResponse(calls === 1 ? [] : [entry]);
  }) as typeof fetch;
  const out = await verifyStudentAssertion({ baseUrl: BASE, assertion: f.assertion, expectedAud: CLIENT_ID, expectedIss: ISS, nowSec: f.now, fetchImpl: rotating });
  assert.deepEqual(out, { valid: true, sub: "pairwise-subject-1" });
  assert.equal(calls, 2);
  const never = (async () => jwksResponse([])) as typeof fetch;
  await assert.rejects(
    verifyStudentAssertion({ baseUrl: BASE, assertion: f.assertion, expectedAud: CLIENT_ID, expectedIss: ISS, nowSec: f.now, fetchImpl: never }),
    InvalidAssertionError
  );
});

test("JWKS outage and wrong-key signatures fail closed, never false", async () => {
  const f = mintFixture({ verified: true });
  const good = { baseUrl: BASE, assertion: f.assertion, expectedAud: CLIENT_ID, expectedIss: ISS, nowSec: f.now };
  await assert.rejects(verifyStudentAssertion({ ...good, fetchImpl: mockFetch(jsonResponse(500, {})) }), VerificationUnavailableError);
  await assert.rejects(
    verifyStudentAssertion({ ...good, fetchImpl: (async () => { throw new Error("down"); }) as typeof fetch }),
    VerificationUnavailableError
  );
  // Signed by a different key than the JWKS advertises.
  const other = generateKeyPairSync("ed25519");
  const forged = mintFixture({ verified: true, key: other.privateKey, kid: f.kid });
  await assert.rejects(
    verifyStudentAssertion({ ...good, assertion: forged.assertion, fetchImpl: mockFetch(jwksResponse([{ ...f.jwk, kid: f.kid }])) }),
    InvalidAssertionError
  );
});
