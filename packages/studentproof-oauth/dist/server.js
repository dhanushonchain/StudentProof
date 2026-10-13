"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyStudentAssertion = verifyStudentAssertion;
// Server-only assertion verification (Node 18+). Import from
// "@studentproof/sdk/server" (or ./dist/server.js) — never from browser
// bundles: this module statically imports node:crypto.
//
// Verifies a v2 assertion against the provider JWKS and returns the plain
// boolean result: { valid } is true ONLY for a fully-verified assertion
// whose vb claim is true. Every other outcome throws — including
// operational failures, so they can never degrade into { valid: false }.
const node_crypto_1 = require("node:crypto");
const index_js_1 = require("./index.js");
const ASSERTION_SKEW_SEC = 60;
async function fetchJwks(jwksUrl, fetchImpl, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetchImpl(jwksUrl, { signal: controller.signal });
        if (!res.ok)
            throw new index_js_1.VerificationUnavailableError(res.status);
        const body = (await res.json().catch(() => null));
        if (!body || !Array.isArray(body.keys))
            throw new index_js_1.VerificationUnavailableError(res.status);
        return body.keys;
    }
    catch (error) {
        if (error instanceof index_js_1.VerificationUnavailableError)
            throw error;
        throw new index_js_1.VerificationUnavailableError();
    }
    finally {
        clearTimeout(timer);
    }
}
async function verifyStudentAssertion(options) {
    const { assertion, expectedAud, expectedIss } = options;
    const fail = () => {
        throw new index_js_1.InvalidAssertionError();
    };
    if (typeof assertion !== "string")
        fail();
    const parts = assertion.split(".");
    if (parts.length !== 4 || parts[0] !== "v2" || !parts[1] || !parts[2] || !parts[3])
        fail();
    const [, kid, payloadB64, sigB64] = parts;
    const timeoutMs = options.timeoutMs ?? index_js_1.DEFAULT_TIMEOUT_MS;
    const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    const base = (options.baseUrl ?? index_js_1.DEFAULT_BASE_URL).replace(/\/+$/, "");
    const jwksUrl = options.jwksUrl ?? `${base}/api/sdk/jwks`;
    const select = (keys) => keys.find((k) => k?.kid === kid && k?.kty === "OKP" && k?.crv === "Ed25519" && typeof k?.x === "string");
    // Rotation overlap: re-read the document once before concluding the kid
    // is unknown (fetchJwks holds no cache, so this is a fresh read).
    let entry = select(await fetchJwks(jwksUrl, fetchImpl, timeoutMs));
    if (!entry)
        entry = select(await fetchJwks(jwksUrl, fetchImpl, timeoutMs));
    if (!entry)
        fail();
    let publicKey;
    try {
        publicKey = (0, node_crypto_1.createPublicKey)({ key: { kty: "OKP", crv: "Ed25519", x: entry.x }, format: "jwk" });
    }
    catch {
        fail();
    }
    let sig;
    try {
        sig = Buffer.from(sigB64, "base64url");
    }
    catch {
        fail();
    }
    const authentic = (0, node_crypto_1.verify)(null, Buffer.from(`sp-sdk-assertion-v2.${kid}.${payloadB64}`, "utf8"), publicKey, sig);
    if (!authentic)
        fail();
    let payload;
    try {
        payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    }
    catch {
        fail();
    }
    if (!payload || typeof payload !== "object")
        fail();
    const p = payload;
    const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
    if (p.v !== 2)
        fail();
    if (p.iss !== expectedIss)
        fail();
    if (typeof p.sub !== "string" || p.sub.length === 0)
        fail();
    if (p.aud !== expectedAud)
        fail();
    if (typeof p.vb !== "boolean")
        fail();
    if (typeof p.iat !== "number" || typeof p.exp !== "number")
        fail();
    if (!Number.isFinite(p.iat) || !Number.isFinite(p.exp))
        fail();
    if (p.exp <= nowSec - ASSERTION_SKEW_SEC)
        fail();
    if (p.iat > nowSec + ASSERTION_SKEW_SEC)
        fail();
    return { valid: p.vb, sub: p.sub };
}
//# sourceMappingURL=server.js.map