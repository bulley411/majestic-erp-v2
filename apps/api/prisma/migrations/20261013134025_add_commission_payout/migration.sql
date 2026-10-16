-- CreateEnum
CREATE TYPE "CommissionBatchStatus" AS ENUM ('DRAFT', 'PROCESSING', 'APPROVED', 'PAID', 'SYNCING', 'SYNCED', 'SYNC_FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommissionRowStatus" AS ENUM ('PENDING', 'PAID', 'SYNCED', 'SYNC_FAILED', 'NO_ACCOUNT');

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CommissionPayoutBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "status" "CommissionBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "paidRows" INTEGER NOT NULL DEFAULT 0,
    "syncedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "noAccountRows" INTEGER NOT NULL DEFAULT 0,
    "requireEdApproval" BOOLEAN NOT NULL DEFAULT true,
    "requireMdApproval" BOOLEAN NOT NULL DEFAULT false,
    "voucherId" TEXT,
    "importedById" TEXT NOT NULL,
    "processedById" TEXT,
    "syncedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayoutRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "payCode" TEXT NOT NULL,
    "agentCode" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "rate" DECIMAL(19,4) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "accountName" TEXT NOT NULL,
    "bank" TEXT,
    "sortCode" TEXT,
    "accountNumber" TEXT,
    "status" "CommissionRowStatus" NOT NULL DEFAULT 'PENDING',
    "transferReference" TEXT,
    "externalReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "syncAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastSyncError" TEXT,
    "syncResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPayoutRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayoutSyncLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowId" TEXT,
    "action" TEXT NOT NULL,
    "requestBody" JSONB,
    "responseBody" JSONB,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayoutSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayoutBatch_fileHash_key" ON "CommissionPayoutBatch"("fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayoutBatch_voucherId_key" ON "CommissionPayoutBatch"("voucherId");

-- CreateIndex
CREATE INDEX "CommissionPayoutBatch_status_idx" ON "CommissionPayoutBatch"("status");

-- CreateIndex
CREATE INDEX "CommissionPayoutBatch_createdAt_idx" ON "CommissionPayoutBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayoutRow_payCode_key" ON "CommissionPayoutRow"("payCode");

-- CreateIndex
CREATE INDEX "CommissionPayoutRow_batchId_idx" ON "CommissionPayoutRow"("batchId");

-- CreateIndex
CREATE INDEX "CommissionPayoutRow_payCode_idx" ON "CommissionPayoutRow"("payCode");

-- CreateIndex
CREATE INDEX "CommissionPayoutRow_status_idx" ON "CommissionPayoutRow"("status");

-- CreateIndex
CREATE INDEX "CommissionPayoutSyncLog_batchId_createdAt_idx" ON "CommissionPayoutSyncLog"("batchId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommissionPayoutBatch" ADD CONSTRAINT "CommissionPayoutBatch_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayoutRow" ADD CONSTRAINT "CommissionPayoutRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommissionPayoutBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayoutSyncLog" ADD CONSTRAINT "CommissionPayoutSyncLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommissionPayoutBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
