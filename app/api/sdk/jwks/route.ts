import { NextResponse } from "next/server";

// Public JSON Web Key Set for SDK v2 assertion verification. Relying parties
// fetch this once (and refresh on unknown kid) to verify Ed25519 assertion
// signatures WITHOUT holding any signing-capable secret.
//
// No authentication: these are public keys. Briefly cacheable (5 minutes)
// so rotation propagates promptly. Misconfiguration fails closed with a
// generic 500 — never a partial key set.
export async function GET() {
  const { SdkCryptoError, buildJwksDocument } = await import("@/lib/sdk-crypto");
  const { getAssertionSigningConfig } = await import("@/lib/sdk-keys");
  try {
    const signing = getAssertionSigningConfig();
    return NextResponse.json(buildJwksDocument(signing.jwksKeys), {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    if (error instanceof SdkCryptoError) {
      console.error("[SDK] JWKS misconfigured: assertion signing config invalid.");
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
    throw error;
  }
}
