// Server-only assertion verification (Node 18+). Import from
// "@studentproof/sdk/server" (or ./dist/server.js) — never from browser
// bundles: this module statically imports node:crypto.
//
// Verifies a v2 assertion against the provider JWKS and returns the plain
// boolean result: { valid } is true ONLY for a fully-verified assertion
// whose vb claim is true. Every other outcome throws — including
// operational failures, so they can never degrade into { valid: false }.
import { createPublicKey, verify } from "node:crypto";
import {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  InvalidAssertionError,
  VerificationUnavailableError,
} from "./index.js";

const ASSERTION_SKEW_SEC = 60;

type Ed25519Jwk = { kty: string; crv: string; x: string; kid?: string };

async function fetchJwks(jwksUrl: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<Ed25519Jwk[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(jwksUrl, { signal: controller.signal });
    if (!res.ok) throw new VerificationUnavailableError(res.status);
    const body = (await res.json().catch(() => null)) as { keys?: unknown } | null;
    if (!body || !Array.isArray(body.keys)) throw new VerificationUnavailableError(res.status);
    return body.keys as Ed25519Jwk[];
  } catch (error) {
    if (error instanceof VerificationUnavailableError) throw error;
    throw new VerificationUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}

export type StudentResult = { valid: boolean; sub: string };

export type VerifyAssertionOptions = {
  baseUrl?: string;
  jwksUrl?: string;
  assertion: string;
  // Your own client_id — assertions minted for anyone else are rejected.
  expectedAud: string;
  // Must equal the issuer you pinned at integration time.
  expectedIss: string;
  nowSec?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export async function verifyStudentAssertion(options: VerifyAssertionOptions): Promise<StudentResult> {
  const { assertion, expectedAud, expectedIss } = options;
  const fail = (): never => {
    throw new InvalidAssertionError();
  };
  if (typeof assertion !== "string") fail();
  const parts = (assertion as string).split(".");
  if (parts.length !== 4 || parts[0] !== "v2" || !parts[1] || !parts[2] || !parts[3]) fail();
  const [, kid, payloadB64, sigB64] = parts as [string, string, string, string];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const jwksUrl = options.jwksUrl ?? `${base}/api/sdk/jwks`;

  const select = (keys: Ed25519Jwk[]) =>
    keys.find((k) => k?.kid === kid && k?.kty === "OKP" && k?.crv === "Ed25519" && typeof k?.x === "string");
  // Rotation overlap: re-read the document once before concluding the kid
  // is unknown (fetchJwks holds no cache, so this is a fresh read).
  let entry = select(await fetchJwks(jwksUrl, fetchImpl, timeoutMs));
  if (!entry) entry = select(await fetchJwks(jwksUrl, fetchImpl, timeoutMs));
  if (!entry) fail();

  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: (entry as Ed25519Jwk).x }, format: "jwk" });
  } catch {
    fail();
  }
  let sig: Buffer;
  try {
    sig = Buffer.from(sigB64, "base64url");
  } catch {
    fail();
  }
  const authentic = verify(
    null,
    Buffer.from(`sp-sdk-assertion-v2.${kid}.${payloadB64}`, "utf8"),
    publicKey!,
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
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  if (p.v !== 2) fail();
  if (p.iss !== expectedIss) fail();
  if (typeof p.sub !== "string" || p.sub.length === 0) fail();
  if (p.aud !== expectedAud) fail();
  if (typeof p.vb !== "boolean") fail();
  if (typeof p.iat !== "number" || typeof p.exp !== "number") fail();
  if (!Number.isFinite(p.iat) || !Number.isFinite(p.exp)) fail();
  if ((p.exp as number) <= nowSec - ASSERTION_SKEW_SEC) fail();
  if ((p.iat as number) > nowSec + ASSERTION_SKEW_SEC) fail();
  return { valid: p.vb as boolean, sub: p.sub as string };
}
