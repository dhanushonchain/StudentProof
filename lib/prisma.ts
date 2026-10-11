import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

// Standard Next.js singleton pattern: reuse one PrismaClient across hot reloads
// in dev instead of opening a new connection pool on every file change.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Aiven presents a project-specific CA that is not in system trust stores,
// so default TLS verification fails against it (SELF_SIGNED_CERT_IN_CHAIN).
// Pin the project's public CA — and only for Aiven hosts, so local Postgres
// and other providers keep default driver behavior.
function sslForConnection(connectionString: string) {
  let hostname = "";
  try {
    hostname = new URL(connectionString).hostname;
  } catch {
    return undefined;
  }
  if (!hostname.endsWith(".aivencloud.com")) return undefined;
  return {
    ca: fs.readFileSync(path.join(process.cwd(), "lib", "certs", "aiven-ca.pem"), "utf8"),
    rejectUnauthorized: true,
  };
}

// pg derives TLS settings from the URL's sslmode first and would discard an
// explicitly passed `ssl` object, so strip sslmode here: the object above is
// authoritative (full verification against the pinned CA for Aiven, driver
// defaults otherwise). Passwords and all other URL parts pass through
// untouched via URL serialization.
function poolConfigFor(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  return { connectionString: url.toString(), ssl: sslForConnection(connectionString) };
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Standard PostgreSQL driver pool (Aiven-ready). Pool sizing defaults are
  // pg's own; serverless instances share nothing in-process, so keep usage
  // bounded per instance via short queries and no manual client checkout.
  const pool = new Pool(poolConfigFor(connectionString));
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
