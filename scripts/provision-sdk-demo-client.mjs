#!/usr/bin/env node
// Provision the dedicated SDK demo client — DEVELOPMENT DATABASES ONLY.
//
// Usage:
//   DATABASE_URL="postgresql://user@localhost:5432/studentproof_dev" \
//     node scripts/provision-sdk-demo-client.mjs \
//     --allow-host localhost \
//     [--redirect-uri http://localhost:3117/auth/callback] \
//     [--client-id sp_client_...] [--name "..."] \
//     [--secret-out /path/to/secret-file] \
//     [--add-redirect-uri] [--rotate --yes]
//
// Safety rules enforced here, not just documented:
//  1. The target host must be a loopback address (localhost, 127.0.0.1, ::1)
//     AND must be passed explicitly via --allow-host with an exact match.
//     Anything else — including the shared Aiven host below — is refused
//     unconditionally. This script can never connect to Aiven or production.
//  2. Re-running with the same client id never creates duplicates and never
//     touches the stored secret hash. Rotation requires --rotate --yes.
//  3. The raw secret is emitted exactly once: printed to the terminal, or —
//     with --secret-out — written to a file created mode 0600 instead (so it
//     never passes through terminal output or logs). Only the SHA-256 hash
//     is ever persisted in the database.
//  4. No migration is applied here. If the SdkClient table is missing, the
//     script stops and tells the administrator to apply migrations on the
//     development database first. Nothing is changed in that case.

import { chmodSync, existsSync, openSync, writeFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";

// Hostnames that must never be provisioned against. Hostnames only — no
// usernames, passwords, or other credentials.
const BLOCKED_HOSTS = new Set([
  "pg-305f238e-getstudentproof.b.aivencloud.com",
]);

// Only loopback targets are ever allowed. DNS names that are not literally
// "localhost" are refused: no resolution tricks, no LAN names, no IPs.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const DEFAULT_CLIENT_ID = "sp_client_demo-localhost-3117";
const DEFAULT_NAME = "Standalone SDK demo (local development)";
const DEFAULT_REDIRECT_URI = "http://localhost:3117/auth/callback";

function usage() {
  return [
    "Provision the dedicated SDK demo client (loopback development database only).",
    "",
    "Required:",
    "  DATABASE_URL must be set (loopback development database).",
    "  --allow-host <localhost|127.0.0.1|::1>  exact DATABASE_URL hostname.",
    "",
    "Options:",
    "  --client-id <id>          default: " + DEFAULT_CLIENT_ID,
    "  --name <name>             default: " + DEFAULT_NAME,
    "  --redirect-uri <uri>      exact demo callback; default: " + DEFAULT_REDIRECT_URI,
    "  --secret-out <path>       write the raw secret once to a new 0600 file instead of stdout.",
    "  --add-redirect-uri        allow appending a redirect URI to an existing client.",
    "  --rotate --yes            rotate the secret of an existing client (explicit).",
  ].join("\n");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--allow-host") out.allowHost = argv[++i];
    else if (arg === "--client-id") out.clientId = argv[++i];
    else if (arg === "--name") out.name = argv[++i];
    else if (arg === "--redirect-uri") out.redirectUri = argv[++i];
    else if (arg === "--secret-out") out.secretOut = argv[++i];
    else if (arg === "--add-redirect-uri") out.addRedirectUri = true;
    else if (arg === "--rotate") out.rotate = true;
    else if (arg === "--yes") out.yes = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function isClientIdFormat(value) {
  return typeof value === "string" && /^sp_client_[A-Za-z0-9_-]{16,64}$/.test(value);
}

function generateClientSecret() {
  return `sp_sk_${randomBytes(32).toString("hex")}`;
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// Emits the raw secret exactly once: to a new 0600 file, or to stdout when
// no file was requested. Never logs it, never returns it to callers.
function emitSecretOnce(rawSecret, secretOut) {
  if (!secretOut) {
    console.log("");
    console.log("  RAW CLIENT SECRET — shown exactly once. Store it as DEMO_CLIENT_SECRET");
    console.log("  in the demo's server-only .env.local. Never commit it or log it again:");
    console.log("");
    console.log(`  ${rawSecret}`);
    console.log("");
    return;
  }
  if (existsSync(secretOut)) fail(`refusing: --secret-out target already exists (${secretOut}).`);
  const fd = openSync(secretOut, "wx", 0o600);
  writeFileSync(fd, rawSecret + "\n", "utf8");
  chmodSync(secretOut, 0o600);
  console.log(`Raw client secret written once to ${secretOut} (mode 0600).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const clientId = args.clientId ?? DEFAULT_CLIENT_ID;
  const name = args.name ?? DEFAULT_NAME;
  const redirectUri = args.redirectUri ?? DEFAULT_REDIRECT_URI;

  if (!isClientIdFormat(clientId)) {
    fail("client id must match sp_client_[A-Za-z0-9_-]{16,64} (same rule as lib/sdk-validation.ts).");
  }
  let callbackUrl;
  try {
    callbackUrl = new URL(redirectUri);
  } catch {
    fail("redirect URI is not a valid URL.");
  }
  if (callbackUrl.protocol === "https:") {
    // fine everywhere
  } else if (callbackUrl.protocol === "http:" && callbackUrl.hostname === "localhost") {
    // development loopback only
  } else {
    fail("redirect URI must be https, or http://localhost for local development.");
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail("DATABASE_URL is not set. Point it at the loopback development database.");
  let host;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    fail("DATABASE_URL is not a valid URL.");
  }
  if (BLOCKED_HOSTS.has(host)) {
    fail(`refusing: ${host} is a shared database host. This script provisions development clients only.`);
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    fail(`refusing: ${host} is not a loopback development host. This script never connects elsewhere.`);
  }
  if (!args.allowHost) {
    fail(`refusing: pass --allow-host ${host} to prove this database was explicitly approved.`);
  }
  if (args.allowHost !== host) fail(`refusing: --allow-host does not match the DATABASE_URL host (${host}).`);

  const db = new Client({ connectionString });
  await db.connect();
  try {
    const table = await db.query("SELECT to_regclass('public.\"SdkClient\"') AS cls");
    if (!table.rows[0]?.cls) {
      fail(
        'the SdkClient table does not exist here. Apply migrations on the development database first, ' +
          "then re-run this script. Nothing was changed.",
      );
    }

    const existing = await db.query(
      'SELECT id, "clientId", name, "redirectUris" FROM public."SdkClient" WHERE "clientId" = $1',
      [clientId],
    );

    if (existing.rowCount === 0) {
      const rawSecret = generateClientSecret();
      await db.query(
        'INSERT INTO public."SdkClient" (id, "clientId", "clientSecretHash", name, "redirectUris") VALUES ($1, $2, $3, $4, $5)',
        [randomUUID(), clientId, sha256Hex(rawSecret), name, [redirectUri]],
      );
      console.log("Demo client registered (new).");
      console.log(`  client_id:    ${clientId}`);
      console.log(`  name:         ${name}`);
      console.log(`  redirect_uri: ${redirectUri}`);
      emitSecretOnce(rawSecret, args.secretOut);
      return;
    }

    const row = existing.rows[0];
    const uris = Array.isArray(row.redirectUris) ? row.redirectUris : [];
    if (args.rotate) {
      if (!args.yes) fail("refusing: rotation needs explicit confirmation — re-run with --rotate --yes.");
      const rawSecret = generateClientSecret();
      await db.query('UPDATE public."SdkClient" SET "clientSecretHash" = $1 WHERE id = $2', [
        sha256Hex(rawSecret),
        row.id,
      ]);
      console.log(`Demo client secret rotated for ${clientId}. Previous secret is now invalid.`);
      emitSecretOnce(rawSecret, args.secretOut);
      return;
    }

    if (!uris.includes(redirectUri)) {
      if (!args.addRedirectUri) {
        fail(
          `client ${clientId} already exists without this redirect URI. Nothing was changed. ` +
            `Re-run with --add-redirect-uri to explicitly append it, or use the registered URI.`,
        );
      }
      await db.query('UPDATE public."SdkClient" SET "redirectUris" = array_append("redirectUris", $1) WHERE id = $2', [
        redirectUri,
        row.id,
      ]);
      console.log(`Added redirect URI to existing demo client ${clientId}. Secret untouched.`);
      console.log(`  redirect_uri: ${redirectUri}`);
      return;
    }

    console.log(`Demo client ${clientId} already provisioned (name: ${row.name}).`);
    console.log("Nothing was created, replaced, or rotated. To rotate the secret, re-run with --rotate --yes.");
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
