-- CreateTable
CREATE TABLE "BusinessApiKey" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Default',
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessApiKey_keyHash_key" ON "BusinessApiKey"("keyHash");

-- AddForeignKey
ALTER TABLE "BusinessApiKey" ADD CONSTRAINT "BusinessApiKey_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ApiUsageEvent" ADD COLUMN "businessApiKeyId" TEXT;

-- AddForeignKey
ALTER TABLE "ApiUsageEvent" ADD CONSTRAINT "ApiUsageEvent_businessApiKeyId_fkey" FOREIGN KEY ("businessApiKeyId") REFERENCES "BusinessApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
