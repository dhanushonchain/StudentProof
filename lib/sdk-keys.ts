// Server-side SDK assertion-signing configuration. Only called
// server-to-server (SDK routes) via lazy dynamic import, never from client —
// the private key must never enter the Edge/client bundle, same reasoning as
// lib/verification-db.ts.
//
// Environment:
// - SDK_ASSERTION_ED25519_PRIVATE_KEY (required): PKCS#8 PEM of the current
//   Ed25519 signing key. Literal "\n" escapes are converted to newlines so
//   the value can live on one line in .env files.
// - SDK_ASSERTION_ED25519_KID (required): key id of the current key. Must
//   equal the RFC 7638 thumbprint of the derived public key — a mismatch
//   fails closed instead of publishing an unverifiable JWKS.
// - SDK_ASSERTION_ED25519_PREV_PUBLIC_JWK (optional): JSON of the previous
//   public JWK, accepted for verification and published during rotation
//   overlap only.
// - SDK_PAIRWISE_SECRET (required): HMAC secret for pairwise subjects.
//   Deliberately SEPARATE from the signing key: rotating the signing key
//   must not re-key every relying party's subject mapping.
// - SDK_ASSERTION_ISSUER (optional): `iss` claim + JWKS trust anchor.
//   Defaults to https://studentproof.app; isolated test deployments set
//   their own origin here and relying parties pin that value.
import type { KeyObject } from "node:crypto";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { SdkCryptoError, publicJwkFromPrivatePem, publicKeyFromJwk, type Ed25519Jwk } from "./sdk-crypto";

export const DEFAULT_ASSERTION_ISSUER = "https://studentproof.app";

export type AssertionSigningConfig = {
  privateKeyPem: string;
  kid: string;
  issuer: string;
  pairwiseSecret: string;
  // kid → verification key: current first, previous (overlap) after.
  verifyKeys: { kid: string; key: KeyObject }[];
  // kid → public JWK, same order, for the JWKS document.
  jwksKeys: { kid: string; publicJwk: Ed25519Jwk }[];
};

function readRequired(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new SdkCryptoError("server_misconfigured");
  }
  return value;
}

// Throws SdkCryptoError("server_misconfigured") on any problem — callers map
// it to a generic 500 with no key material, ids, or PEM fragments.
export function getAssertionSigningConfig(): AssertionSigningConfig {
  const rawPem = readRequired("SDK_ASSERTION_ED25519_PRIVATE_KEY");
  const privateKeyPem = rawPem.includes("\\n") ? rawPem.replace(/\\n/g, "\n") : rawPem;
  const configuredKid = readRequired("SDK_ASSERTION_ED25519_KID");
  const pairwiseSecret = readRequired("SDK_PAIRWISE_SECRET");
  const issuer = process.env.SDK_ASSERTION_ISSUER ?? DEFAULT_ASSERTION_ISSUER;

  const { publicJwk, kid: derivedKid } = publicJwkFromPrivatePem(privateKeyPem);
  if (configuredKid !== derivedKid) throw new SdkCryptoError("server_misconfigured");

  const verifyKeys: { kid: string; key: KeyObject }[] = [];
  const jwksKeys: { kid: string; publicJwk: Ed25519Jwk }[] = [];
  // Current key's KeyObject for the local verify path is derived from the
  // private key (same parameters the signer uses — no skew possible).
  const currentPublic = createPublicKey(createPrivateKey(privateKeyPem));
  verifyKeys.push({ kid: derivedKid, key: currentPublic });
  jwksKeys.push({ kid: derivedKid, publicJwk });

  const prevRaw = process.env.SDK_ASSERTION_ED25519_PREV_PUBLIC_JWK;
  if (typeof prevRaw === "string" && prevRaw.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(prevRaw);
    } catch {
      throw new SdkCryptoError("server_misconfigured");
    }
    const { key, kid } = publicKeyFromJwk(parsed);
    if (kid === derivedKid) throw new SdkCryptoError("server_misconfigured");
    verifyKeys.push({ kid, key });
    const prevJwk = parsed as { x: string };
    jwksKeys.push({ kid, publicJwk: { kty: "OKP", crv: "Ed25519", x: prevJwk.x } });
  }

  return { privateKeyPem, kid: derivedKid, issuer, pairwiseSecret, verifyKeys, jwksKeys };
}
