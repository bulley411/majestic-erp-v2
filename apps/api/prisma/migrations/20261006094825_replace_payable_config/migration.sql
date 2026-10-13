/*
  Warnings:

  - You are about to drop the `PayableAccountConfig` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PaymentPayableKey" AS ENUM ('VOUCHER_DEFAULT', 'COMMISSION_PAYOUT');

-- DropForeignKey
ALTER TABLE "PayableAccountConfig" DROP CONSTRAINT "PayableAccountConfig_accountId_fkey";

-- DropTable
DROP TABLE "PayableAccountConfig";

-- DropEnum
DROP TYPE "PayableKey";

-- CreateTable
CREATE TABLE "PaymentPayableConfig" (
    "id" TEXT NOT NULL,
    "key" "PaymentPayableKey" NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PaymentPayableConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentPayableConfig_key_key" ON "PaymentPayableConfig"("key");

-- AddForeignKey
ALTER TABLE "PaymentPayableConfig" ADD CONSTRAINT "PaymentPayableConfig_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
