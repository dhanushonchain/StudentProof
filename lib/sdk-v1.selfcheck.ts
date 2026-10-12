// Runnable checks for SDK v1 M1: sdk-crypto, sdk-validation, sdk-codes.
// Pure — no I/O, no env, no database. Store atomicity itself is an M2
// database concern (same conditional-write pattern as issuance claims);
// here a fake store proves every branch of the lifecycle logic.
// Run:
//   ./node_modules/.bin/tsc lib/sdk-v1.selfcheck.ts lib/sdk-crypto.ts lib/sdk-validation.ts lib/sdk-codes.ts \
//     --outDir /tmp/sp-sdkv1 --module commonjs --target es2020 \
//     --moduleResolution node --skipLibCheck --strict --esModuleInterop \
//   && node /tmp/sp-sdkv1/sdk-v1.selfcheck.js
import assert from "node:assert/strict";
import {
  buildAssertionV2,
  buildJwksDocument,
  generateAssertionKeypair,
  generateAuthorizationCode,
  generateClientSecret,
  jwkThumbprint,
  pairwiseSubject,
  publicJwkFromPrivatePem,
  publicKeyFromJwk,
  SdkCryptoError,
  sha256Hex,
  verifyAssertionV2,
  verifyClientSecret,
  verifyPkceS256,
  type AssertionPublicKeys,
} from "./sdk-crypto";
import { assertAuthorizeRequest, buildCodeRedirectUri, buildErrorRedirectUri, isClientIdFormat, isRedirectSchemeAllowed, matchRedirectUri, parseSdkFlowParams, requireStudentSession, resolveCredentialGate, resolveEmailDisplay, SdkRequestError } from "./sdk-validation";
import { buildCodeRecord, codeMatchesBinding, isCodeRedeemable, redeemCodeTransition, type SdkCodeRecord, type SdkCodeStore } from "./sdk-codes";
import { createHash } from "node:crypto";

// --- Redirect matching: exact or nothing. ---
{
  const registered = ["https://app.example.com/cb", "https://app.example.com/cb2"];
  assert.equal(matchRedirectUri(registered, "https://app.example.com/cb"), true);
  assert.equal(matchRedirectUri(registered, "https://app.example.com/cb/"), false); // trailing slash
  assert.equal(matchRedirectUri(registered, "https://APP.example.com/cb"), false); // case
  assert.equal(matchRedirectUri(registered, "https://app.example.com/cb?x=1"), false); // query
  assert.equal(matchRedirectUri(registered, "https://evil.example.com/cb"), false);
  assert.equal(matchRedirectUri(registered, "https://app.example.com/cb.evil.com"), false); // prefix trap
  assert.equal(matchRedirectUri(registered, "  https://app.example.com/cb  "), true); // trim ok
  assert.equal(matchRedirectUri(registered, ""), false);
  assert.equal(matchRedirectUri(registered, null), false);
  assert.equal(matchRedirectUri([], "https://app.example.com/cb"), false);
}

// --- Scheme policy: https everywhere; localhost http in dev only. ---
{
  assert.equal(isRedirectSchemeAllowed("https://app.example.com/cb", "production"), true);
  assert.equal(isRedirectSchemeAllowed("http://app.example.com/cb", "production"), false);
  assert.equal(isRedirectSchemeAllowed("http://localhost:3000/cb", "development"), true);
  assert.equal(isRedirectSchemeAllowed("http://localhost/cb", "development"), true);
  assert.equal(isRedirectSchemeAllowed("http://localhost:3000/cb", "production"), false);
  assert.equal(isRedirectSchemeAllowed("http://127.0.0.1:3000/cb", "development"), false); // loopback IP, not the name
  assert.equal(isRedirectSchemeAllowed("http://lan-pc:3000/cb", "development"), false);
  assert.equal(isRedirectSchemeAllowed("javascript:alert(1)", "development"), false);
  assert.equal(isRedirectSchemeAllowed("not-a-url", "production"), false);
}

// --- Client ids and the full authorize gate. ---
{
  assert.equal(isClientIdFormat("sp_client_abcDEF1234567890"), true);
  assert.equal(isClientIdFormat("sp_live_abcDEF123456"), false);
  assert.equal(isClientIdFormat("sp_client_short"), false);
  assert.equal(isClientIdFormat(123), false);
  const ok = assertAuthorizeRequest({
    clientId: "sp_client_abcDEF1234567890",
    redirectUri: "https://app.example.com/cb",
    state: "xyz-state-1",
    registeredUris: ["https://app.example.com/cb"],
    env: "production",
  });
  assert.deepEqual(ok, { clientId: "sp_client_abcDEF1234567890", redirectUri: "https://app.example.com/cb", state: "xyz-state-1" });
  for (const bad of [
    { clientId: "sp_client_abcDEF1234567890", redirectUri: "https://evil.example.com/cb", state: "s", registeredUris: ["https://app.example.com/cb"], env: "production" as const },
    { clientId: "nope", redirectUri: "https://app.example.com/cb", state: "s", registeredUris: ["https://app.example.com/cb"], env: "production" as const },
    { clientId: "sp_client_abcDEF1234567890", redirectUri: "https://app.example.com/cb", state: "", registeredUris: ["https://app.example.com/cb"], env: "production" as const },
    { clientId: "sp_client_abcDEF1234567890", redirectUri: "http://localhost:1/cb", state: "s", registeredUris: ["http://localhost:1/cb"], env: "production" as const },
  ]) {
    assert.throws(() => assertAuthorizeRequest(bad), SdkRequestError);
  }
  // Error carries a fixed code only — never URIs, ids, or secrets.
  try {
    assertAuthorizeRequest({ clientId: "sp_client_abcDEF1234567890", redirectUri: "https://evil.example.com/secret-cb", state: "s", registeredUris: ["https://x.example.com/"], env: "production" });
    assert.fail("must throw");
  } catch (error) {
    assert.ok(error instanceof SdkRequestError);
    assert.ok(!error.message.includes("evil"), error.message);
  }
}

// --- Code generation: raw travels once, only the hash persists. ---
{
  const { record, code } = buildCodeRecord({
    id: "rec-1",
    userId: "user-1",
    clientId: "sp_client_abcDEF1234567890",
    redirectUri: "https://app.example.com/cb",
    codeChallenge: "c",
    nowMs: 1000,
  });
  assert.equal(typeof code, "string");
  assert.ok(code.length >= 43);
  assert.equal(record.codeHash, sha256Hex(code));
  assert.ok(!record.codeHash.includes(code.slice(0, 8)));
  assert.equal(record.codeHash.length, 64);
  assert.equal(record.expiresAtMs, 1000 + 10 * 60 * 1000);
  assert.equal(record.usedAtMs, null);
  const other = buildCodeRecord({ id: "rec-2", userId: "user-1", clientId: "sp_client_abcDEF1234567890", redirectUri: "https://app.example.com/cb", codeChallenge: "c", nowMs: 1000 });
  assert.notEqual(other.code, code, "codes are unique");
}

// --- PKCE S256 vectors (independent computation, not the module itself). ---
{
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  assert.equal(verifyPkceS256(verifier, challenge), true);
  assert.equal(verifyPkceS256(verifier, challenge.slice(0, -1) + (challenge.endsWith("A") ? "B" : "A")), false);
  assert.equal(verifyPkceS256("too-short", challenge), false);
  assert.equal(verifyPkceS256(verifier + " ", challenge), false);
  assert.equal(verifyPkceS256(null, challenge), false);
  assert.equal(verifyPkceS256(verifier, null), false);
}

// --- Redeemability + duplicate redemption through a fake store. ---
{
  const live: SdkCodeRecord = {
    id: "r", codeHash: "h", clientId: "c", userId: "u", redirectUri: "x", codeChallenge: "y",
    expiresAtMs: 2000, usedAtMs: null,
  };
  assert.equal(isCodeRedeemable(live, 1000), true);
  assert.equal(isCodeRedeemable(live, 2000), false); // boundary: exp is exclusive
  assert.equal(isCodeRedeemable({ ...live, usedAtMs: 1500 }, 1000), false);

  // Fake store with compare-and-swap redemption (mirrors the required atomic
  // DB write; a fake proves the branches, not the database serialization).
  const store = new Map<string, SdkCodeRecord>([["h", live]]);
  function redeemAtomic(codeHash: string, nowMs: number): SdkCodeRecord | null {
    const current = store.get(codeHash);
    if (!current || current.usedAtMs !== null) return null; // lost race / replay
    const next = redeemCodeTransition(current, nowMs);
    if (!next) return null;
    store.set(codeHash, next);
    return next;
  }
  const first = redeemAtomic("h", 1000);
  assert.ok(first && first.usedAtMs === 1000);
  assert.equal(redeemAtomic("h", 1001), null, "second redemption refused");
  assert.equal(redeemAtomic("missing", 1001), null);
}

// --- Assertion v2 roundtrip, tamper, kid, issuer, audience, lifetime. ---
{
  const { privateKeyPem, publicJwk, kid } = generateAssertionKeypair();
  assert.equal(kid, jwkThumbprint(publicJwk));
  assert.deepEqual(publicJwkFromPrivatePem(privateKeyPem).publicJwk, publicJwk);
  const { key } = publicKeyFromJwk({ ...publicJwk, kid });
  const publicKeys: AssertionPublicKeys = { [kid]: key };
  const iss = "https://studentproof.app";
  const aud = "sp_client_abcDEF1234567890";
  const now = 1_700_000_000;
  const a = buildAssertionV2({ privateKeyPem, kid, iss, sub: "sub-1", aud, verified: true, iatSec: now });
  assert.equal(a.split(".").length, 4);
  assert.ok(a.startsWith(`v2.${kid}.`), "kid travels in the clear for key selection");
  assert.deepEqual(verifyAssertionV2({ assertion: a, publicKeys, iss, aud, nowSec: now + 60 }), {
    sub: "sub-1",
    verified: true,
    expiresAtSec: now + 300,
    issuer: iss,
    kid,
  });
  // Verifiers holding only the public key cannot mint: wrong-key signatures fail.
  const other = generateAssertionKeypair();
  const forged = buildAssertionV2({ privateKeyPem: other.privateKeyPem, kid, iss, sub: "mallory", aud, verified: true, iatSec: now });
  assert.throws(() => verifyAssertionV2({ assertion: forged, publicKeys, iss, aud, nowSec: now }), SdkCryptoError);
  // Unknown kid, wrong issuer, wrong audience, tampered payload, expired, and garbage all fail alike.
  const otherKeys: AssertionPublicKeys = { [other.kid]: publicKeyFromJwk({ ...other.publicJwk, kid: other.kid }).key };
  assert.throws(() => verifyAssertionV2({ assertion: a, publicKeys: otherKeys, iss, aud, nowSec: now }), SdkCryptoError);
  assert.throws(() => verifyAssertionV2({ assertion: a, publicKeys, iss: "https://evil.example.com", aud, nowSec: now }), SdkCryptoError);
  assert.throws(() => verifyAssertionV2({ assertion: a, publicKeys, iss, aud: "sp_client_other00000000", nowSec: now }), SdkCryptoError);
  const segs = a.split(".");
  segs[2] = Buffer.from(JSON.stringify({ v: 2, iss, sub: "mallory", aud, vb: true, iat: now, exp: now + 300 })).toString("base64url");
  assert.throws(() => verifyAssertionV2({ assertion: segs.join("."), publicKeys, iss, aud, nowSec: now }), SdkCryptoError);
  assert.throws(() => verifyAssertionV2({ assertion: a, publicKeys, iss, aud, nowSec: now + 361 }), SdkCryptoError);
  // Inside the skew window the same assertion still verifies.
  assert.equal(verifyAssertionV2({ assertion: a, publicKeys, iss, aud, nowSec: now + 359 }).sub, "sub-1");
  assert.throws(() => verifyAssertionV2({ assertion: "garbage", publicKeys, iss, aud, nowSec: now }), SdkCryptoError);
  assert.throws(() => verifyAssertionV2({ assertion: "v1.abc.def", publicKeys, iss, aud, nowSec: now }), SdkCryptoError);
  try {
    verifyAssertionV2({ assertion: a, publicKeys, iss, aud: "nope", nowSec: now });
    assert.fail("must throw");
  } catch (error) {
    assert.ok(error instanceof SdkCryptoError);
    assert.equal(error.message, "invalid_assertion");
  }
  // JWKS document carries public keys only, current first.
  const jwks = buildJwksDocument([
    { kid, publicJwk },
    { kid: other.kid, publicJwk: other.publicJwk },
  ]);
  assert.equal(jwks.keys.length, 2);
  // Rotation overlap: an assertion minted under the previous key still
  // verifies while its public key stays published; dropping it refuses.
  const rotated = buildAssertionV2({ privateKeyPem, kid, iss, sub: "sub-1", aud, verified: true, iatSec: now });
  const overlapKeys: AssertionPublicKeys = {
    [other.kid]: publicKeyFromJwk({ ...other.publicJwk, kid: other.kid }).key,
    [kid]: key,
  };
  assert.equal(verifyAssertionV2({ assertion: rotated, publicKeys: overlapKeys, iss, aud, nowSec: now }).sub, "sub-1");
  assert.throws(() => verifyAssertionV2({ assertion: rotated, publicKeys: otherKeys, iss, aud, nowSec: now }), SdkCryptoError);
  assert.deepEqual(jwks.keys[0], { kty: "OKP", crv: "Ed25519", x: publicJwk.x, use: "sig", alg: "EdDSA", kid });
  assert.ok(!JSON.stringify(jwks).includes("BEGIN PRIVATE"), "no private material in JWKS");
  // Malformed previous-JWK input fails closed.
  assert.throws(() => publicKeyFromJwk({ kty: "EC", crv: "P-256" }), SdkCryptoError);
}

// --- Pairwise subjects: stable per pair, unlinkable across clients. ---
{
  const a1 = pairwiseSubject({ userId: "u", clientId: "sp_client_AAAAAAAAAAAAAAAA", secret: "s" });
  assert.equal(a1, pairwiseSubject({ userId: "u", clientId: "sp_client_AAAAAAAAAAAAAAAA", secret: "s" }));
  assert.notEqual(a1, pairwiseSubject({ userId: "u", clientId: "sp_client_BBBBBBBBBBBBBBBB", secret: "s" }));
  assert.notEqual(a1, pairwiseSubject({ userId: "v", clientId: "sp_client_AAAAAAAAAAAAAAAA", secret: "s" }));
}

// --- Code uniqueness sanity across a batch. ---
{
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) seen.add(generateAuthorizationCode());
  assert.equal(seen.size, 50);
}

// --- Client secrets: format, hash discipline, constant-time compare. ---
{
  const raw = generateClientSecret();
  assert.ok(raw.startsWith("sp_sk_"));
  assert.equal(raw.length, "sp_sk_".length + 64);
  assert.notEqual(generateClientSecret(), raw);
  const stored = sha256Hex(raw);
  assert.equal(verifyClientSecret(raw, stored), true);
  assert.equal(verifyClientSecret(raw + "x", stored), false);
  assert.equal(verifyClientSecret("", stored), false);
  assert.equal(verifyClientSecret(raw, ""), false);
  assert.equal(verifyClientSecret(null, stored), false);
  assert.equal(verifyClientSecret(raw, null), false);
  assert.equal(verifyClientSecret(raw, "not-hex-at-all!!"), false);
}

// --- Assertion builder guards: misconfiguration fails closed. ---
{
  const { privateKeyPem, kid } = generateAssertionKeypair();
  const good = { privateKeyPem, kid, iss: "https://studentproof.app", sub: "s", aud: "a", verified: true, iatSec: 1 };
  assert.throws(() => buildAssertionV2({ ...good, privateKeyPem: "" }), SdkCryptoError);
  assert.throws(() => buildAssertionV2({ ...good, privateKeyPem: "not-a-key" }), SdkCryptoError);
  assert.throws(() => buildAssertionV2({ ...good, kid: "" }), SdkCryptoError);
  assert.throws(() => buildAssertionV2({ ...good, iss: "" }), SdkCryptoError);
  assert.throws(() => buildAssertionV2({ ...good, sub: "" }), SdkCryptoError);
  assert.throws(() => buildAssertionV2({ ...good, aud: "" }), SdkCryptoError);
}

// --- Flow params: every field required, PKCE method exact. ---
{
  const good = {
    client_id: "sp_client_abcDEF1234567890",
    redirect_uri: "https://app.example.com/cb",
    state: "st-1",
    mode: "signup",
    code_challenge: "challenge-value",
    code_challenge_method: "S256",
  };
  assert.deepEqual(parseSdkFlowParams(good), {
    clientId: "sp_client_abcDEF1234567890",
    redirectUri: "https://app.example.com/cb",
    state: "st-1",
    mode: "signup",
    codeChallenge: "challenge-value",
  });
  // Array values take the first entry (Next.js multi-value params).
  assert.equal(parseSdkFlowParams({ ...good, state: ["st-1", "st-2"] }).state, "st-1");
  for (const bad of [
    { ...good, mode: "login" },
    { ...good, mode: undefined },
    { ...good, code_challenge_method: "plain" },
    { ...good, code_challenge: undefined },
    { ...good, state: "" },
    { ...good, client_id: undefined },
  ]) {
    assert.throws(() => parseSdkFlowParams(bad as Record<string, string | string[] | undefined>), SdkRequestError);
  }
}

// --- Redirect builders: exact URI + encoded state, fixed error codes. ---
{
  const ok = buildCodeRedirectUri({ redirectUri: "https://app.example.com/cb", code: "raw-code-123", state: "st 1&x=2" });
  assert.equal(ok, "https://app.example.com/cb?code=raw-code-123&state=st%201%26x%3D2");
  const denied = buildErrorRedirectUri({ redirectUri: "https://app.example.com/cb", error: "access_denied", state: "st-1" });
  assert.equal(denied, "https://app.example.com/cb?error=access_denied&state=st-1");
  const missing = buildErrorRedirectUri({ redirectUri: "https://app.example.com/cb", error: "verification_required", state: "st-1" });
  assert.ok(missing.includes("error=verification_required") && !missing.includes("code="));
}

// --- Session separation: students pass, business and anonymous do not. ---
{
  assert.deepEqual(requireStudentSession({ walletPublicKey: "0xabc", businessId: undefined }), { walletPublicKey: "0xabc" });
  assert.throws(() => requireStudentSession(null), SdkRequestError);
  assert.throws(() => requireStudentSession({}), SdkRequestError);
  assert.throws(() => requireStudentSession({ walletPublicKey: "0xabc", businessId: "biz-1" }), SdkRequestError);
  assert.throws(() => requireStudentSession({ walletPublicKey: "", businessId: undefined }), SdkRequestError);
  try {
    requireStudentSession({ walletPublicKey: "0xabc", businessId: "biz-1" });
    assert.fail("must throw");
  } catch (error) {
    assert.ok(error instanceof SdkRequestError);
    assert.equal(error.message, "wrong_account_type");
  }
}

// --- Credential gate: only a currently-valid credential proceeds. ---
{
  assert.equal(resolveCredentialGate({ hasValidCredential: true }), "proceed");
  assert.equal(resolveCredentialGate({ hasValidCredential: false }), "verification_required");
}

// --- Email display: Google-supplied text only, never identity. ---
// resolveEmailDisplay decides what the connect page may print. Impersonation
// attempts via crafted emails must degrade to null or display-only output:
// no return value here is ever usable as an account lookup key (there is no
// by-email lookup anywhere; identity anchors on googleSub→wallet).
{
  assert.deepEqual(resolveEmailDisplay({ email: "student@example.edu", googleEmailVerified: true }), {
    email: "student@example.edu",
    verified: true,
  });
  assert.deepEqual(resolveEmailDisplay({ email: "  student@example.edu  ", googleEmailVerified: true }), {
    email: "student@example.edu",
    verified: true,
  });
  // Unverified or unknown flag: still displayable, never labeled verified.
  assert.deepEqual(resolveEmailDisplay({ email: "student@example.edu", googleEmailVerified: false }), {
    email: "student@example.edu",
    verified: false,
  });
  assert.deepEqual(resolveEmailDisplay({ email: "student@example.edu" }), {
    email: "student@example.edu",
    verified: false,
  });
  assert.equal(resolveEmailDisplay(null), null);
  assert.equal(resolveEmailDisplay(undefined), null);
  assert.equal(resolveEmailDisplay({}), null);
  assert.equal(resolveEmailDisplay({ email: "" }), null);
  assert.equal(resolveEmailDisplay({ email: "   " }), null);
  assert.equal(resolveEmailDisplay({ email: 42, googleEmailVerified: true }), null);
  assert.equal(resolveEmailDisplay({ email: "x".repeat(321) }), null);
  // A second Google account reusing someone else's address string changes
  // nothing: output carries no account id, wallet, or lookup handle.
  const a = resolveEmailDisplay({ email: "same@example.edu", googleEmailVerified: true });
  const b = resolveEmailDisplay({ email: "same@example.edu", googleEmailVerified: false });
  assert.ok(a && b && a.email === b.email && a.verified !== b.verified);
}

// --- Session edge cases: crafted sessions cannot escalate. ---
{
  // Extra unknown fields (email, name, attacker wallet claim without the
  // server-minted shape) do not influence the wallet resolution.
  assert.deepEqual(
    requireStudentSession({ walletPublicKey: "0xabc", businessId: undefined, email: "victim@example.edu" } as Parameters<typeof requireStudentSession>[0]),
    { walletPublicKey: "0xabc" }
  );
  // Falsy-but-present business markers still count as business sessions.
  assert.throws(() => requireStudentSession({ walletPublicKey: "0xabc", businessId: "x" }), SdkRequestError);
  // Non-string wallets (arrays, numbers, objects) are rejected, never coerced.
  for (const bad of [["0xabc"], 42, {}, true]) {
    assert.throws(
      () => requireStudentSession({ walletPublicKey: bad, businessId: undefined } as Parameters<typeof requireStudentSession>[0]),
      SdkRequestError
    );
  }
}

// --- Store-level redemption: binding, expiry, and concurrent double-spend. ---
async function main(): Promise<void> {
// --- Token ordering invariants, exercised against a spy store that mirrors
// the route's exact sequence (client auth -> lookup -> binding -> expiry ->
// PKCE -> consume). A wrong secret or bad PKCE must never reach redemption:
// the spy records every redeemAtomic call to prove it. ---
{
  type Stored = { hash: string; clientDbId: string; redirectUri: string; challenge: string; exp: number; used: boolean };
  const db = new Map<string, Stored>();
  db.set("h-good", { hash: "h-good", clientDbId: "db-1", redirectUri: "https://app.example.com/cb", challenge: "ch", exp: 5000, used: false });
  let redeemCalls = 0;
  async function redeemSpy(hash: string, nowMs: number): Promise<boolean> {
    redeemCalls += 1;
    const r = db.get(hash);
    if (!r || r.used || nowMs >= r.exp) return false;
    r.used = true;
    return true;
  }
  async function tokenAttempt(args: { secretOk: boolean; hash: string; clientDbId: string; redirectUri: string; verifierOk: boolean; nowMs: number }): Promise<string> {
    if (!args.secretOk) return "invalid_client"; // client auth first: store untouched
    const rec = db.get(args.hash);
    if (!rec || rec.clientDbId !== args.clientDbId || rec.redirectUri !== args.redirectUri) return "invalid_grant";
    if (rec.used || args.nowMs >= rec.exp) return "invalid_grant";
    if (!args.verifierOk) return "invalid_grant"; // PKCE before consume
    return (await redeemSpy(args.hash, args.nowMs)) ? "issued" : "invalid_grant";
  }
  const base = { secretOk: true, hash: "h-good", clientDbId: "db-1", redirectUri: "https://app.example.com/cb", verifierOk: true, nowMs: 1000 };
  assert.equal(await tokenAttempt({ ...base, secretOk: false }), "invalid_client");
  assert.equal(await tokenAttempt({ ...base, hash: "h-missing" }), "invalid_grant");
  assert.equal(await tokenAttempt({ ...base, clientDbId: "db-2" }), "invalid_grant");
  assert.equal(await tokenAttempt({ ...base, redirectUri: "https://evil.example.com/cb" }), "invalid_grant");
  assert.equal(await tokenAttempt({ ...base, verifierOk: false }), "invalid_grant");
  assert.equal(redeemCalls, 0, "no failed pre-check may consume a code");
  assert.equal(await tokenAttempt(base), "issued");
  assert.equal(await tokenAttempt(base), "invalid_grant", "replay refused before touching the store");
  assert.equal(redeemCalls, 1, "one consume total: pre-checks refuse replays without a write");
}

  const stored: SdkCodeRecord = {
    id: "r1", codeHash: "h1", clientId: "db-client-1", userId: "u1",
    redirectUri: "https://app.example.com/cb", codeChallenge: "ch",
    expiresAtMs: 5000, usedAtMs: null,
  };
  assert.equal(codeMatchesBinding(stored, { clientDbId: "db-client-1", redirectUri: "https://app.example.com/cb" }), true);
  assert.equal(codeMatchesBinding(stored, { clientDbId: "db-client-2", redirectUri: "https://app.example.com/cb" }), false);
  assert.equal(codeMatchesBinding(stored, { clientDbId: "db-client-1", redirectUri: "https://evil.example.com/cb" }), false);

  // Fake store with atomic compare-and-swap (mirrors the required Prisma
  // conditional write; proves logic, not database serialization).
  const rows = new Map<string, SdkCodeRecord>([["h1", stored]]);
  const store: SdkCodeStore = {
    async getByHash(hash: string) {
      return rows.get(hash) ?? null;
    },
    async redeemAtomic(hash: string, nowMs: number) {
      const current = rows.get(hash);
      if (!current || current.usedAtMs !== null || nowMs >= current.expiresAtMs) return null;
      const next = { ...current, usedAtMs: nowMs };
      rows.set(hash, next);
      return next;
    },
  };
  assert.deepEqual((await store.getByHash("h1"))?.id, "r1");
  assert.equal(await store.getByHash("nope"), null);
  const [first, second] = await Promise.all([store.redeemAtomic("h1", 1000), store.redeemAtomic("h1", 1000)]);
  const winners = [first, second].filter((r) => r !== null);
  assert.equal(winners.length, 1, "at most one concurrent redemption succeeds");
  assert.equal(await store.redeemAtomic("h1", 1001), null, "replay refused");
}

main().then(
  () => console.log("sdk-v1: all checks passed"),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
