-- AlterTable
ALTER TABLE "VerificationRecord" ADD COLUMN "issuanceStatus" TEXT NOT NULL DEFAULT 'not_started',
ADD COLUMN "issuanceAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastIssuanceError" TEXT,
ADD COLUMN "mintTxHash" TEXT,
ADD COLUMN "issuanceUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Credential" ADD COLUMN "verificationRecordId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Credential_verificationRecordId_key" ON "Credential"("verificationRecordId");
