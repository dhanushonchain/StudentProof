-- Instant-valued columns compared against live time must be unambiguous
-- across application/database timezones (see M4 TZ audit). Conversion uses
-- AT TIME ZONE 'UTC' — established, not assumed, from both write frames:
-- (1) application writes go through Prisma as naive UTC-wall values
-- (Vercel runs UTC; verified against live rows), and (2) database now()
-- values on production (Neon, UTC) are UTC-wall. Interpreting every stored
-- naive value as UTC therefore preserves each instant bit-for-bit. Do NOT
-- apply a different zone without re-establishing both frames. NULLs pass
-- through untouched. Display/order-only columns stay naive TIMESTAMP.

-- AlterTable
ALTER TABLE "Credential" ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "VerificationRecord" ALTER COLUMN "issuanceUpdatedAt" TYPE TIMESTAMPTZ(3) USING "issuanceUpdatedAt" AT TIME ZONE 'UTC';
