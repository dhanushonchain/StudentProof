// Runnable checks for SDK OAuth Application Registration & Management.
// Tests registration validation, callback URL policies, multi-tenant ownership,
// secret rotation, revocation, and the full OAuth authorize + token lifecycle.
// Run:
//   ./node_modules/.bin/tsc lib/sdk-oauth-registration.selfcheck.ts lib/sdk-client-policy.ts lib/sdk-crypto.ts lib/sdk-validation.ts lib/sdk-codes.ts \
//     --outDir /tmp/sp-oauth-reg-check --module commonjs --target es2020 \
//     --moduleResolution node --skipLibCheck --strict --esModuleInterop \
//   && node /tmp/sp-oauth-reg-check/lib/sdk-oauth-registration.selfcheck.js

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  parseAndValidateCallbackUrls,
  toOAuthClientDTO,
  toOAuthClientStatus,
  validateApplicationName,
  validateWebsiteUrl,
  type DeveloperOAuthClientDTO,
} from "./sdk-client-policy";
import {
  buildAssertionV2,
  generateAssertionKeypair,
  generateClientSecret,
  pairwiseSubject,
  publicKeyFromJwk,
  sha256Hex,
  verifyAssertionV2,
  verifyClientSecret,
  verifyPkceS256,
  type AssertionPublicKeys,
} from "./sdk-crypto";
import {
  assertAuthorizeRequest,
  buildCodeRedirectUri,
  isClientIdFormat,
  matchRedirectUri,
  parseSdkFlowParams,
  SdkRequestError,
} from "./sdk-validation";
import { buildCodeRecord, codeMatchesBinding, redeemCodeTransition, type SdkCodeRecord } from "./sdk-codes";

console.log("Starting SDK OAuth registration self-checks...");

// --- 1. Application Name Validation ---
{
  assert.equal(validateApplicationName("  My Application  "), "My Application");
  assert.equal(validateApplicationName("A".repeat(100)).length, 100);
  assert.throws(() => validateApplicationName(""), /cannot be empty/);
  assert.throws(() => validateApplicationName("   "), /cannot be empty/);
  assert.throws(() => validateApplicationName("A".repeat(101)), /at most 100 characters/);
  assert.throws(() => validateApplicationName("Bad\nName"), /cannot contain control characters/);
  assert.throws(() => validateApplicationName(123), /must be a string/);
  assert.throws(() => validateApplicationName(null), /must be a string/);
}

// --- 2. Website URL Validation ---
{
  assert.equal(validateWebsiteUrl("https://example.com"), "https://example.com");
  assert.equal(validateWebsiteUrl("https://example.com/app/home"), "https://example.com/app/home");
  assert.equal(validateWebsiteUrl("http://localhost:3000", "development"), "http://localhost:3000");
  assert.throws(() => validateWebsiteUrl("http://localhost:3000", "production"), /must be https/);
  assert.throws(() => validateWebsiteUrl("http://evil.com", "development"), /must be https/);
  assert.throws(() => validateWebsiteUrl("not-a-url"), /not a valid URL/);
  assert.throws(() => validateWebsiteUrl(""), /cannot be empty/);
}

// --- 3. Callback URL(s) Validation ---
{
  // Valid list / comma-separated
  const valid = parseAndValidateCallbackUrls(
    "https://example.com/cb1, https://example.com/cb2\nhttps://example.com/cb3",
    "development"
  );
  assert.deepEqual(valid, [
    "https://example.com/cb1",
    "https://example.com/cb2",
    "https://example.com/cb3",
  ]);

  // Deduplication
  const dedup = parseAndValidateCallbackUrls([
    "https://example.com/cb",
    "https://example.com/cb",
    "https://example.com/cb",
  ]);
  assert.deepEqual(dedup, ["https://example.com/cb"]);

  // Localhost allowed in dev, disallowed in prod
  assert.deepEqual(
    parseAndValidateCallbackUrls(["http://localhost:8080/callback"], "development"),
    ["http://localhost:8080/callback"]
  );
  assert.throws(
    () => parseAndValidateCallbackUrls(["http://localhost:8080/callback"], "production"),
    /must use https/
  );

  // Insecure HTTP rejected
  assert.throws(
    () => parseAndValidateCallbackUrls(["http://evil.example.com/cb"], "development"),
    /must use https/
  );

  // Malformed URLs rejected
  assert.throws(() => parseAndValidateCallbackUrls(["not-a-url"]), /Invalid callback URL/);
  assert.throws(() => parseAndValidateCallbackUrls([]), /At least one/);
  assert.throws(() => parseAndValidateCallbackUrls(""), /At least one/);

  // Max 10 URLs limit
  const tooMany = Array.from({ length: 11 }, (_, i) => `https://example.com/cb${i}`);
  assert.throws(() => parseAndValidateCallbackUrls(tooMany), /At most 10/);
}

// --- 4. Client ID & Secret Generation and Hashing ---
{
  function generateRandomClientId(): string {
    return `sp_client_${randomBytes(16).toString("hex")}`;
  }

  const clientId = generateRandomClientId();
  assert.ok(isClientIdFormat(clientId), `Client ID ${clientId} must match isClientIdFormat`);
  assert.ok(clientId.startsWith("sp_client_"));
  assert.equal(isClientIdFormat("sp_live_api_key_1234567"), false, "sp_live_ is rejected as client ID");

  const rawSecret = generateClientSecret();
  assert.ok(rawSecret.startsWith("sp_sk_"));
  assert.equal(rawSecret.length, 6 + 64); // "sp_sk_" + 64 hex chars (32 bytes entropy)

  const hash = sha256Hex(rawSecret);
  assert.equal(verifyClientSecret(rawSecret, hash), true);
  assert.equal(verifyClientSecret("wrong-secret", hash), false);
  assert.equal(verifyClientSecret("", hash), false);
  assert.equal(verifyClientSecret(rawSecret, ""), false);
}

// --- 5. Multi-Tenant In-Memory Client Store (Simulation) ---
{
  type ClientRecord = {
    id: string;
    clientId: string;
    clientSecretHash: string;
    name: string;
    websiteUrl: string | null;
    businessId: string;
    redirectUris: string[];
    revokedAt: Date | null;
    createdAt: Date;
  };

  const db = new Map<string, ClientRecord>();

  function registerClient(args: {
    businessId: string;
    name: string;
    websiteUrl: string;
    redirectUris: string[];
  }): { client: DeveloperOAuthClientDTO; secret: string } {
    const clientId = `sp_client_${randomBytes(16).toString("hex")}`;
    const rawSecret = generateClientSecret();
    const row: ClientRecord = {
      id: randomUUID(),
      clientId,
      clientSecretHash: sha256Hex(rawSecret),
      name: args.name,
      websiteUrl: args.websiteUrl,
      businessId: args.businessId,
      redirectUris: args.redirectUris,
      revokedAt: null,
      createdAt: new Date(),
    };
    db.set(row.id, row);
    return { client: toOAuthClientDTO(row), secret: rawSecret };
  }

  function listClients(businessId: string): DeveloperOAuthClientDTO[] {
    return Array.from(db.values())
      .filter((c) => c.businessId === businessId)
      .map(toOAuthClientDTO);
  }

  function updateRedirectUris(args: {
    businessId: string;
    clientId: string;
    redirectUris: string[];
  }): DeveloperOAuthClientDTO | null {
    const existing = Array.from(db.values()).find(
      (c) => c.businessId === args.businessId && (c.id === args.clientId || c.clientId === args.clientId)
    );
    if (!existing) return null;
    if (existing.revokedAt) throw new Error("Revoked application");
    existing.redirectUris = args.redirectUris;
    return toOAuthClientDTO(existing);
  }

  function rotateSecret(args: {
    businessId: string;
    clientId: string;
  }): { client: DeveloperOAuthClientDTO; secret: string } | null {
    const existing = Array.from(db.values()).find(
      (c) => c.businessId === args.businessId && (c.id === args.clientId || c.clientId === args.clientId)
    );
    if (!existing) return null;
    if (existing.revokedAt) throw new Error("Revoked application");
    const newSecret = generateClientSecret();
    existing.clientSecretHash = sha256Hex(newSecret);
    return { client: toOAuthClientDTO(existing), secret: newSecret };
  }

  function revokeClient(args: {
    businessId: string;
    clientId: string;
  }): DeveloperOAuthClientDTO | null {
    const existing = Array.from(db.values()).find(
      (c) => c.businessId === args.businessId && (c.id === args.clientId || c.clientId === args.clientId)
    );
    if (!existing) return null;
    if (!existing.revokedAt) {
      existing.revokedAt = new Date();
    }
    return toOAuthClientDTO(existing);
  }

  // Authorize/Token lookup: revoked clients return null!
  function getClientForOAuth(clientId: string): { id: string; clientId: string; name: string; redirectUris: string[] } | null {
    const row = Array.from(db.values()).find((c) => c.clientId === clientId);
    if (!row || row.revokedAt) return null;
    return { id: row.id, clientId: row.clientId, name: row.name, redirectUris: row.redirectUris };
  }

  function getSecretHashForToken(clientDbId: string): string | null {
    const row = db.get(clientDbId);
    if (!row || row.revokedAt) return null;
    return row.clientSecretHash;
  }

  // --- Test multi-tenant isolation ---
  const biz1 = "biz-alice";
  const biz2 = "biz-bob";

  const aliceApp = registerClient({
    businessId: biz1,
    name: "Alice Marketplace",
    websiteUrl: "https://alice.example.com",
    redirectUris: ["https://alice.example.com/oauth/callback"],
  });

  assert.equal(aliceApp.client.name, "Alice Marketplace");
  assert.equal(aliceApp.client.status, "active");
  assert.equal(aliceApp.client.revokedAt, null);
  // Ensure secret is not in DTO
  assert.equal("clientSecret" in aliceApp.client, false);
  assert.equal("clientSecretHash" in aliceApp.client, false);

  // Bob cannot see Alice's apps
  const bobList = listClients(biz2);
  assert.equal(bobList.length, 0);

  // Bob cannot update Alice's app
  assert.equal(
    updateRedirectUris({
      businessId: biz2,
      clientId: aliceApp.client.clientId,
      redirectUris: ["https://bob.example.com/callback"],
    }),
    null
  );

  // Bob cannot rotate Alice's secret
  assert.equal(rotateSecret({ businessId: biz2, clientId: aliceApp.client.clientId }), null);

  // Bob cannot revoke Alice's app
  assert.equal(revokeClient({ businessId: biz2, clientId: aliceApp.client.clientId }), null);

  // Alice can update her own callback URLs
  const updatedAlice = updateRedirectUris({
    businessId: biz1,
    clientId: aliceApp.client.clientId,
    redirectUris: [
      "https://alice.example.com/oauth/callback",
      "https://alice.example.com/oauth/callback2",
    ],
  });
  assert.ok(updatedAlice);
  assert.equal(updatedAlice.redirectUris.length, 2);

  // --- Test secret rotation ---
  const oldSecret = aliceApp.secret;
  const rotationResult = rotateSecret({
    businessId: biz1,
    clientId: aliceApp.client.clientId,
  });
  assert.ok(rotationResult);
  const newSecret = rotationResult.secret;
  assert.notEqual(oldSecret, newSecret);

  // Lookup in DB: old secret fails, new secret succeeds
  const currentHash = getSecretHashForToken(aliceApp.client.id);
  assert.ok(currentHash);
  assert.equal(verifyClientSecret(oldSecret, currentHash), false, "Old secret must be invalidated");
  assert.equal(verifyClientSecret(newSecret, currentHash), true, "New secret must authenticate");

  // --- Test complete OAuth flow with registered client ---
  const signingKeys = generateAssertionKeypair();
  const publicKeys: AssertionPublicKeys = {
    [signingKeys.kid]: publicKeyFromJwk({ ...signingKeys.publicJwk, kid: signingKeys.kid }).key,
  };

  // 1. Authorize Request validation
  const clientForAuth = getClientForOAuth(aliceApp.client.clientId);
  assert.ok(clientForAuth);
  assert.equal(clientForAuth.clientId, aliceApp.client.clientId);

  const flowParams = parseSdkFlowParams({
    client_id: aliceApp.client.clientId,
    redirect_uri: "https://alice.example.com/oauth/callback",
    state: "random-state-123456",
    mode: "signin",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
  });
  assert.equal(flowParams.clientId, aliceApp.client.clientId);

  assertAuthorizeRequest({
    clientId: flowParams.clientId,
    redirectUri: flowParams.redirectUri,
    state: flowParams.state,
    registeredUris: clientForAuth.redirectUris,
    env: "production",
  });

  // Unregistered redirect URI is rejected
  assert.throws(
    () =>
      assertAuthorizeRequest({
        clientId: flowParams.clientId,
        redirectUri: "https://evil.example.com/steal-code",
        state: flowParams.state,
        registeredUris: clientForAuth.redirectUris,
        env: "production",
      }),
    SdkRequestError
  );

  // 2. Authorization code issuance
  const authCodeRecord = buildCodeRecord({
    id: "auth-code-1",
    userId: "student-user-1",
    clientId: clientForAuth.id,
    redirectUri: flowParams.redirectUri,
    codeChallenge: flowParams.codeChallenge,
    nowMs: Date.now(),
  });

  const redirectUrl = buildCodeRedirectUri({
    redirectUri: flowParams.redirectUri,
    code: authCodeRecord.code,
    state: flowParams.state,
  });
  assert.ok(redirectUrl.includes("code="));
  assert.ok(redirectUrl.includes("state=random-state-123456"));

  // 3. Token exchange
  // Client authenticates with secret
  const presentedClientId = aliceApp.client.clientId;
  const clientForToken = getClientForOAuth(presentedClientId);
  assert.ok(clientForToken);

  const hashForToken = getSecretHashForToken(clientForToken.id);
  assert.ok(hashForToken);
  assert.equal(verifyClientSecret(newSecret, hashForToken), true);

  // Code matches binding
  assert.ok(
    codeMatchesBinding(authCodeRecord.record, {
      clientDbId: clientForToken.id,
      redirectUri: flowParams.redirectUri,
    })
  );
  assert.ok(matchRedirectUri(clientForToken.redirectUris, flowParams.redirectUri));

  // PKCE verification
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.ok(verifyPkceS256(verifier, authCodeRecord.record.codeChallenge));

  // Atomic redemption
  const redeemed = redeemCodeTransition(authCodeRecord.record, Date.now());
  assert.ok(redeemed);
  assert.notEqual(redeemed.usedAtMs, null);

  // Replay attempt fails
  assert.equal(redeemCodeTransition(redeemed, Date.now()), null);

  // Assertion issuance
  const pairwiseSub = pairwiseSubject({
    userId: "student-user-1",
    clientId: aliceApp.client.clientId,
    secret: "test-pairwise-secret",
  });

  const assertion = buildAssertionV2({
    privateKeyPem: signingKeys.privateKeyPem,
    kid: signingKeys.kid,
    iss: "https://studentproof.app",
    sub: pairwiseSub,
    aud: aliceApp.client.clientId,
    verified: true,
    iatSec: Math.floor(Date.now() / 1000),
  });

  const verifiedAssertion = verifyAssertionV2({
    assertion,
    publicKeys,
    iss: "https://studentproof.app",
    aud: aliceApp.client.clientId,
    nowSec: Math.floor(Date.now() / 1000),
  });
  assert.equal(verifiedAssertion.verified, true);
  assert.equal(verifiedAssertion.sub, pairwiseSub);

  // --- Test Revocation ---
  const revokedApp = revokeClient({
    businessId: biz1,
    clientId: aliceApp.client.clientId,
  });
  assert.ok(revokedApp);
  assert.equal(revokedApp.status, "revoked");
  assert.ok(revokedApp.revokedAt !== null);

  // Once revoked, getClientForOAuth returns null immediately!
  assert.equal(getClientForOAuth(aliceApp.client.clientId), null);
  // Secret hash lookup also returns null!
  assert.equal(getSecretHashForToken(aliceApp.client.id), null);

  // Subsequent authorize or token exchange fails closed
  assert.equal(getClientForOAuth(aliceApp.client.clientId), null);

  // Cannot rotate secrets on a revoked client
  assert.throws(
    () => rotateSecret({ businessId: biz1, clientId: aliceApp.client.clientId }),
    /Revoked/
  );

  // Cannot update redirect URIs on a revoked client
  assert.throws(
    () =>
      updateRedirectUris({
        businessId: biz1,
        clientId: aliceApp.client.clientId,
        redirectUris: ["https://alice.example.com/new"],
      }),
    /Revoked/
  );
}

console.log("sdk-oauth-registration: all checks passed successfully!");
