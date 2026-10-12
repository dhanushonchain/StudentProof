// Pure SDK v1 cryptography: authorization codes, PKCE S256, pairwise
// subjects, and short-lived signed assertions. Zero imports beyond
// node:crypto — safe to unit-test anywhere.
//
// Secrets and private keys are ALWAYS parameters, never read from env or
// logged here. Callers (SDK endpoints) supply them from server-only
// configuration (see lib/sdk-keys.ts).
//
// Assertion design v2 (Ed25519, asymmetric):
// - Wire format: `v2.<kid>.<base64url(payload)>.<base64url(sig)>` (JWT-like,
//   no dependency). Payload JSON: {v:2, iss, sub, aud, vb, iat, exp} with
//   Unix seconds; vb is the boolean student status, nothing else.
// - sig = Ed25519(privateKey, "sp-sdk-assertion-v2.<kid>.<payloadB64>").
//   Relying parties verify with the PUBLIC key from GET /api/sdk/jwks.json,
//   so verification capability never implies minting capability (this was the
//   fundamental weakness of the retired v1 HMAC design, where every verifier
//   held the shared signing secret).
// - `kid` selects the verification key: rotation = publish the new public
//   key under a new kid, sign with the new private key, keep the old public
//   key published for one overlap window, then drop it. No database change.
// - TTL 5 minutes, ±60s clock skew tolerated on verify.
// - `sub` is pairwise per (client, user): HMAC-SHA256 over a domain-separated
//   label with a DEDICATED pairwise secret (never the signing key), so two
//   clients cannot correlate the same student, signing-key rotation does not
//   re-key every subject, and no mapping table (which would itself be PII) is
//   stored.
import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject,
} from "node:crypto";

export const SDK_CODE_BYTES = 32;
export const SDK_ASSERTION_TTL_SEC = 300;
export const SDK_ASSERTION_SKEW_SEC = 60;

export class SdkCryptoError extends Error {}

// Client secrets for manual v1 registration: 256-bit entropy, prefixed so
// the identifier family is recognizable and never confused with a student
// API key (`sp_live_…`) or client id (`sp_client_…`). Only the SHA-256 hex
// digest is persisted; the raw value is shown once at registration.
export function generateClientSecret(): string {
  return `sp_sk_${randomBytes(SDK_CODE_BYTES).toString("hex")}`;
}

// Constant-time comparison of a presented secret against a stored hash.
// Never throws on malformed input (false instead), and reveals nothing
// about which half mismatched. Used for client_secret verification.
export function verifyClientSecret(provided: unknown, storedHash: unknown): boolean {
  if (typeof provided !== "string" || provided.length === 0) return false;
  if (typeof storedHash !== "string" || storedHash.length === 0) return false;
  const presented = Buffer.from(sha256Hex(provided), "utf8");
  const expected = Buffer.from(storedHash, "utf8");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

// 43-char base64url code (256-bit entropy). The RAW value travels once in a
// redirect; only its SHA-256 hex digest is ever persisted.
export function generateAuthorizationCode(): string {
  return randomBytes(SDK_CODE_BYTES).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// PKCE S256 (RFC 7636 §4.6): challenge === BASE64URL(SHA256(ascii_verifier)).
// Compared with timingSafeEqual on fixed-width buffers. Returns false (never
// throws) for malformed input so callers map it to a generic 400.
export function verifyPkceS256(verifier: unknown, challenge: unknown): boolean {
  if (typeof verifier !== "string" || typeof challenge !== "string") return false;
  if (verifier.length < 43 || verifier.length > 128) return false;
  if (!/^[A-Za-z0-9\-_~.]+$/.test(verifier)) return false;
  const expected = createHash("sha256").update(verifier, "ascii").digest("base64url");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(challenge, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Deterministic, unlinkable subject per (client, user). No storage needed.
export function pairwiseSubject(args: { userId: string; clientId: string; secret: string }): string {
  const hmac = createHmac("sha256", args.secret);
  hmac.update(`sp-sdk-sub-v1|${args.clientId}|${args.userId}`, "utf8");
  return hmac.digest("base64url");
}

export type AssertionSecrets = { current: string; previous?: string };
export function buildAssertionV2(args: {
  privateKeyPem: string;
  kid: string;
  iss: string;
  sub: string;
  aud: string;
  verified: boolean;
  iatSec: number;
  ttlSec?: number;
}): string {
  // Fail closed on misconfiguration or malformed inputs rather than minting
  // a meaningless or unverifiable assertion.
  if (
    typeof args.privateKeyPem !== "string" ||
    args.privateKeyPem.length === 0 ||
    typeof args.kid !== "string" ||
    args.kid.length === 0 ||
    typeof args.iss !== "string" ||
    args.iss.length === 0 ||
    typeof args.sub !== "string" ||
    args.sub.length === 0 ||
    typeof args.aud !== "string" ||
    args.aud.length === 0 ||
    !Number.isFinite(args.iatSec)
  ) {
    throw new SdkCryptoError("invalid_assertion_params");
  }
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(args.privateKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") throw new SdkCryptoError("invalid_assertion_params");
  } catch (error) {
    if (error instanceof SdkCryptoError) throw error;
    throw new SdkCryptoError("invalid_assertion_params");
  }
  const payload = {
    v: 2,
    iss: args.iss,
    sub: args.sub,
    aud: args.aud,
    vb: args.verified,
    iat: args.iatSec,
    exp: args.iatSec + (args.ttlSec ?? SDK_ASSERTION_TTL_SEC),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signedPortion = `sp-sdk-assertion-v2.${args.kid}.${payloadB64}`;
  const sigB64 = sign(null, Buffer.from(signedPortion, "utf8"), privateKey).toString("base64url");
  return `v2.${args.kid}.${payloadB64}.${sigB64}`;
}

export type VerifiedAssertionV2 = {
  sub: string;
  verified: boolean;
  expiresAtSec: number;
  issuer: string;
  kid: string;
};

export type AssertionPublicKeys = Record<string, KeyObject>;

// Throws SdkCryptoError with a fixed safe code (never key material, never
// the payload) on any failure: shape, unknown kid, signature, issuer,
// audience, or lifetime.
export function verifyAssertionV2(args: {
  assertion: unknown;
  publicKeys: AssertionPublicKeys;
  iss: string;
  aud: string;
  nowSec: number;
}): VerifiedAssertionV2 {
  const fail = (): never => {
    throw new SdkCryptoError("invalid_assertion");
  };
  if (typeof args.assertion !== "string") fail();
  const parts = (args.assertion as string).split(".");
  if (parts.length !== 4 || parts[0] !== "v2" || !parts[1] || !parts[2] || !parts[3]) fail();
  const [, kid, payloadB64, sigB64] = parts as [string, string, string, string];
  const publicKey = args.publicKeys[kid];
  if (!publicKey || publicKey.asymmetricKeyType !== "ed25519") fail();
  let sig: Buffer;
  try {
    sig = Buffer.from(sigB64, "base64url");
  } catch {
    fail();
  }
  const authentic = verify(
    null,
    Buffer.from(`sp-sdk-assertion-v2.${kid}.${payloadB64}`, "utf8"),
    publicKey,
    sig!
  );
  if (!authentic) fail();
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    fail();
  }
  if (!payload || typeof payload !== "object") fail();
  const p = payload as Record<string, unknown>;
  if (p.v !== 2) fail();
  if (p.iss !== args.iss) fail();
  if (typeof p.sub !== "string" || p.sub.length === 0) fail();
  if (p.aud !== args.aud) fail();
  if (typeof p.vb !== "boolean") fail();
  if (typeof p.iat !== "number" || typeof p.exp !== "number") fail();
  if (!Number.isFinite(p.iat) || !Number.isFinite(p.exp)) fail();
  if ((p.exp as number) <= args.nowSec - SDK_ASSERTION_SKEW_SEC) fail();
  if ((p.iat as number) > args.nowSec + SDK_ASSERTION_SKEW_SEC) fail();
  return {
    sub: p.sub as string,
    verified: p.vb as boolean,
    expiresAtSec: p.exp as number,
    issuer: p.iss as string,
    kid,
  };
}

export type Ed25519Jwk = {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
};

// RFC 7638 thumbprint over the required members, base64url. Deterministic
// key ids: the same public key always yields the same kid, so rotation state
// (which kids are published) is derivable without a registry.
export function jwkThumbprint(jwk: Ed25519Jwk): string {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`;
  return createHash("sha256").update(canonical, "utf8").digest("base64url");
}

// Generates a fresh Ed25519 assertion-signing keypair. The private PEM goes
// to server-only configuration (never committed, never shipped); the public
// JWK is published via GET /api/sdk/jwks.json.
export function generateAssertionKeypair(): { privateKeyPem: string; publicJwk: Ed25519Jwk; kid: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const exported = publicKey.export({ format: "jwk" });
  if (exported.kty !== "OKP" || exported.crv !== "Ed25519" || typeof exported.x !== "string") {
    throw new SdkCryptoError("keygen_failed");
  }
  const publicJwk: Ed25519Jwk = { kty: "OKP", crv: "Ed25519", x: exported.x };
  return { privateKeyPem, publicJwk, kid: jwkThumbprint(publicJwk) };
}

// Derives the public JWK (and its kid) from a configured private PEM — what
// the JWKS endpoint publishes for the current signing key.
export function publicJwkFromPrivatePem(privateKeyPem: string): { publicJwk: Ed25519Jwk; kid: string } {
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(privateKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") throw new SdkCryptoError("invalid_key");
  } catch (error) {
    if (error instanceof SdkCryptoError) throw error;
    throw new SdkCryptoError("invalid_key");
  }
  const exported = createPublicKey(privateKey).export({ format: "jwk" });
  if (exported.kty !== "OKP" || exported.crv !== "Ed25519" || typeof exported.x !== "string") {
    throw new SdkCryptoError("invalid_key");
  }
  const publicJwk: Ed25519Jwk = { kty: "OKP", crv: "Ed25519", x: exported.x };
  return { publicJwk, kid: jwkThumbprint(publicJwk) };
}

// Parses a previously published public JWK (rotation overlap) into a
// verification key. Rejects anything that is not an Ed25519 OKP key.
export function publicKeyFromJwk(jwk: unknown): { key: KeyObject; kid: string } {
  if (!jwk || typeof jwk !== "object") throw new SdkCryptoError("invalid_key");
  const { kty, crv, x, kid } = jwk as Record<string, unknown>;
  if (kty !== "OKP" || crv !== "Ed25519" || typeof x !== "string" || x.length === 0) {
    throw new SdkCryptoError("invalid_key");
  }
  let key: KeyObject;
  try {
    key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x } as never, format: "jwk" });
  } catch {
    throw new SdkCryptoError("invalid_key");
  }
  const derivedKid = jwkThumbprint({ kty: "OKP", crv: "Ed25519", x });
  if (typeof kid === "string" && kid.length > 0 && kid !== derivedKid) throw new SdkCryptoError("invalid_key");
  return { key, kid: derivedKid };
}

export type JwksKeyEntry = Ed25519Jwk & { use: "sig"; alg: "EdDSA"; kid: string };

// Public JWKS document for GET /api/sdk/jwks.json: current key first,
// previous (overlap) keys after. Public keys only — never private material.
export function buildJwksDocument(keys: { kid: string; publicJwk: Ed25519Jwk }[]): { keys: JwksKeyEntry[] } {
  return {
    keys: keys.map(({ kid, publicJwk }) => ({
      kty: publicJwk.kty,
      crv: publicJwk.crv,
      x: publicJwk.x,
      use: "sig" as const,
      alg: "EdDSA" as const,
      kid,
    })),
  };
}
