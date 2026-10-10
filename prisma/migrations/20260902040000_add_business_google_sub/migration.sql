-- DropIndex
DROP INDEX "Business_email_key";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "googleSub" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Business_googleSub_key" ON "Business"("googleSub");
