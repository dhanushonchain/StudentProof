import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Standard Next.js singleton pattern: reuse one PrismaClient across hot reloads
// in dev instead of opening a new connection pool on every file change.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
