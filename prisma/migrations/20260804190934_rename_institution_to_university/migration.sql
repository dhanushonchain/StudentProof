/*
  Warnings:

  - You are about to drop the column `institutionName` on the `Credential` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Credential" DROP COLUMN "institutionName",
ADD COLUMN     "universityName" TEXT;
