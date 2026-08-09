/*
  Warnings:

  - You are about to drop the column `programmeName` on the `Credential` table. All the data in the column will be lost.
  - You are about to drop the column `universityName` on the `Credential` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Credential" DROP COLUMN "programmeName",
DROP COLUMN "universityName";
