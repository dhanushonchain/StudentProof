import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// This project keeps all secrets in .env.local (Next.js convention), not the
// default .env Prisma's CLI reads — load it explicitly so `prisma migrate`/
// `prisma generate` see the same DATABASE_URL the app uses at runtime.
loadEnv({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
