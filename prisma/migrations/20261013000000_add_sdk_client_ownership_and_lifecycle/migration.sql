-- AlterTable
ALTER TABLE "SdkClient" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "SdkClient" ADD COLUMN "businessId" TEXT;
ALTER TABLE "SdkClient" ADD COLUMN "revokedAt" TIMESTAMPTZ(3);

-- AddForeignKey
ALTER TABLE "SdkClient" ADD CONSTRAINT "SdkClient_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
