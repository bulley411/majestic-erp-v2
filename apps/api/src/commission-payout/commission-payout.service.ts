import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CommissionExcelService } from './commission-excel.service';
import { CommissionWebhookService } from './commission-webhook.service';
import { CommissionSettingsService } from './commission-settings.service';
import { checksum } from '../documents/storage';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { importSchema, processSchema, syncSchema } from './dto/schemas';

@Injectable()
export class CommissionPayoutService {
  constructor(
    private prisma: PrismaService,
    private excel: CommissionExcelService,
    private webhook: CommissionWebhookService,
    private settings: CommissionSettingsService,
  ) {}

  async findAll(filters: { status?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;

    return this.prisma.commissionPayoutBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { rows: true } },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.commissionPayoutBatch.findUniqueOrThrow({
      where: { id },
      include: {
        voucher: { select: { id: true, voucherNo: true, status: true } },
        rows: { orderBy: { createdAt: 'asc' } },
        syncLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
  }

  async import(
    buffer: Buffer,
    fileName: string,
    data: z.infer<typeof importSchema>,
    actorId: string,
  ) {
    if (!(await this.settings.isEnabled())) {
      throw new BadRequestException(
        'Commission payout integration is disabled. Enable it in Settings → Finance settings.',
      );
    }

    const fileHash = checksum(buffer);

    const existing = await this.prisma.commissionPayoutBatch.findUnique({
      where: { fileHash },
    });
    if (existing) {
      throw new ConflictException(
        `This exact file was already imported (batch on ${existing.createdAt.toISOString()}).`,
      );
    }

    const parsed = await this.excel.parse(buffer);

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.commissionPayoutBatch.create({
        data: {
          fileName,
          fileHash,
          dateFrom: parsed.dateFrom,
          dateTo: parsed.dateTo,
          generatedAt: parsed.generatedAt,
          status: 'DRAFT',
          totalAmount: parsed.totalAmount.toFixed(4),
          totalRows: parsed.rows.length,
          noAccountRows: parsed.noAccountCount,
          requireEdApproval: data.requireEdApproval,
          requireMdApproval: data.requireMdApproval,
          notes: data.notes,
          importedById: actorId,
          rows: {
            create: parsed.rows.map((r) => ({
              payCode: r.payCode,
              agentCode: r.agentCode,
              recordCount: r.recordCount,
              rate: r.rate.toFixed(4),
              amount: r.amount.toFixed(4),
              accountName: r.accountName,
              bank: r.bank,
              sortCode: r.sortCode,
              accountNumber: r.accountNumber,
              status: r.hasAccount ? 'PENDING' : 'NO_ACCOUNT',
            })),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'commission.imported',
          entityType: 'CommissionPayoutBatch',
          entityId: batch.id,
          after: {
            fileName,
            rows: parsed.rows.length,
            totalAmount: parsed.totalAmount.toFixed(2),
            noAccount: parsed.noAccountCount,
          } as never,
        },
      });

      return batch;
    });
  }

  async process(
    batchId: string,
    data: z.infer<typeof processSchema>,
    actorId: string,
  ) {
    const batch = await this.prisma.commissionPayoutBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { rows: true },
    });

    if (batch.status !== 'DRAFT') {
      throw new BadRequestException(
        `Only DRAFT batches can be processed. Current: ${batch.status}.`,
      );
    }
    if (batch.voucherId) {
      throw new ConflictException('A voucher already exists for this batch.');
    }

    const payableRows = batch.rows.filter((r) => r.status === 'PENDING');
    if (!payableRows.length) {
      throw new BadRequestException(
        'No payable rows. All rows are missing bank accounts.',
      );
    }

    // Resolve category
    let categoryId = data.categoryId;
    if (!categoryId) {
      const category = await this.prisma.expenseCategory.findFirst({
        where: {
          OR: [
            { name: { contains: 'Agent', mode: 'insensitive' } },
            { name: { contains: 'Field', mode: 'insensitive' } },
          ],
          isActive: true,
        },
      });
      if (!category) {
        throw new BadRequestException(
          'No expense category found for commission payouts. Specify one explicitly.',
        );
      }
      categoryId = category.id;
    }

    // Resolve bank
    let bankId = data.bankId;
    if (!bankId) {
      const bank = await this.prisma.bank.findFirst({
        where: { name: 'Access Bank' },
      });
      const anyBank = bank ?? (await this.prisma.bank.findFirst());
      if (!anyBank) throw new BadRequestException('No banks configured.');
      bankId = anyBank.id;
    }

    const total = payableRows.reduce(
      (sum, r) => sum.plus(r.amount.toString()),
      new Decimal(0),
    );

    const year = new Date().getUTCFullYear();
    const voucherCount = await this.prisma.voucher.count();
    const voucherNo = `MAPA/VCH/${year}/${String(voucherCount + 1).padStart(3, '0')}`;

    const voucher = await this.prisma.voucher.create({
      data: {
        voucherNo,
        date: batch.dateTo,
        description: `Commission payout - ${batch.fileName}`,
        categoryId,
        amount: total.toFixed(4),
        whtRate: '0',
        whtAmount: '0',
        netAmount: total.toFixed(4),
        bankId,
        beneficiary: `Commission payout - ${payableRows.length} agents`,
        status: 'PENDING_APPROVAL',
        raisedById: actorId,
      },
    });

    const updated = await this.prisma.commissionPayoutBatch.update({
      where: { id: batchId },
      data: {
        voucherId: voucher.id,
        status: 'PROCESSING',
        processedById: actorId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'commission.processed',
        entityType: 'CommissionPayoutBatch',
        entityId: batchId,
        after: {
          voucherNo,
          total: total.toFixed(2),
          rows: payableRows.length,
        } as never,
      },
    });

    return { batch: updated, voucher };
  }

  async sync(
    batchId: string,
    data: z.infer<typeof syncSchema>,
    actorId: string,
  ) {
    const batch = await this.prisma.commissionPayoutBatch.findUniqueOrThrow({
      where: { id: batchId },
    });

    if (batch.status === 'CANCELLED') {
      throw new BadRequestException('Cannot sync a cancelled batch.');
    }

    const where: any = {
      batchId,
      status: { in: ['PAID', 'SYNC_FAILED'] },
    };
    if (data.rowIds?.length) {
      where.id = { in: data.rowIds };
    }

    const rows = await this.prisma.commissionPayoutRow.findMany({ where });
    if (!rows.length) {
      throw new BadRequestException('No rows to sync.');
    }

    await this.prisma.commissionPayoutBatch.update({
      where: { id: batchId },
      data: { status: 'SYNCING' },
    });

    const payments = rows.map((r) => ({
      payCode: r.payCode,
      reference: r.transferReference ?? batch.voucherId ?? batch.id,
      occurredAt: r.paidAt ?? new Date(),
    }));

    try {
      const response = await this.webhook.notifyPayments(
        batchId,
        payments,
        rows.length === 1 ? [rows[0].id] : undefined,
      );

      const now = new Date();
      for (const r of rows) {
        const isRejected = response.rejected?.some(
          (rej) => rej.pay_code === r.payCode,
        );
        await this.prisma.commissionPayoutRow.update({
          where: { id: r.id },
          data: {
            status: isRejected ? 'SYNC_FAILED' : 'SYNCED',
            syncedAt: isRejected ? null : now,
            syncAttempts: { increment: 1 },
            lastSyncError: isRejected
              ? response.rejected.find((rej) => rej.pay_code === r.payCode)
                  ?.error ?? null
              : null,
            syncResponse: response as never,
          },
        });
      }

      const counts = await this.recountRows(batchId);
      const newStatus =
        counts.failed > 0
          ? 'SYNC_FAILED'
          : counts.synced === counts.paid
            ? 'SYNCED'
            : 'PAID';

      const updated = await this.prisma.commissionPayoutBatch.update({
        where: { id: batchId },
        data: {
          status: newStatus,
          syncedRows: counts.synced,
          failedRows: counts.failed,
          syncedAt: newStatus === 'SYNCED' ? now : undefined,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'commission.synced',
          entityType: 'CommissionPayoutBatch',
          entityId: batchId,
          after: {
            applied: response.applied,
            ignored: response.ignored,
            rejected: response.rejected?.length ?? 0,
          } as never,
        },
      });

      return { batch: updated, response };
    } catch (e) {
      await this.prisma.commissionPayoutBatch.update({
        where: { id: batchId },
        data: { status: 'SYNC_FAILED' },
      });
      throw e;
    }
  }

  async retryRow(batchId: string, rowId: string, actorId: string) {
    const row = await this.prisma.commissionPayoutRow.findUniqueOrThrow({
      where: { id: rowId },
    });

    if (row.batchId !== batchId) {
      throw new BadRequestException('Row does not belong to this batch.');
    }
    if (row.status !== 'SYNC_FAILED') {
      throw new BadRequestException(
        `Only SYNC_FAILED rows can be retried. Current: ${row.status}.`,
      );
    }

    return this.sync(batchId, { rowIds: [rowId] }, actorId);
  }

  async cancel(batchId: string, actorId: string) {
    const batch = await this.prisma.commissionPayoutBatch.findUniqueOrThrow({
      where: { id: batchId },
    });

    if (batch.status !== 'DRAFT') {
      throw new BadRequestException(
        `Only DRAFT batches can be cancelled. Current: ${batch.status}.`,
      );
    }

    await this.prisma.commissionPayoutBatch.update({
      where: { id: batchId },
      data: { status: 'CANCELLED' },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'commission.cancelled',
        entityType: 'CommissionPayoutBatch',
        entityId: batchId,
      },
    });

    return { ok: true };
  }

  /**
   * Called by PaymentsService when a commission voucher is marked paid.
   */
 /**
 * Called by PaymentsService / PaymentBatchesService when a commission voucher
 * is marked paid. Accepts the VOUCHER id (not batch id) so the caller can
 * invoke it without a lookup.
 */
async onVoucherPaid(voucherId: string) {
  const batch = await this.prisma.commissionPayoutBatch.findUnique({
    where: { voucherId },
  });

  // Not a commission voucher — nothing to do.
  if (!batch) return;

  // Idempotent: already processed.
  if (batch.status === 'PAID' || batch.status === 'SYNCED') return;

  const now = new Date();

  // Mark only rows that were actually payable (i.e. had a bank account).
  // NO_ACCOUNT rows are terminal and must not be touched.
  const paidResult = await this.prisma.commissionPayoutRow.updateMany({
    where: {
      batchId: batch.id,
      status: 'PENDING',
    },
    data: { status: 'PAID', paidAt: now },
  });

  await this.prisma.commissionPayoutBatch.update({
    where: { id: batch.id },
    data: {
      status: 'PAID',
      paidRows: paidResult.count,
    },
  });

  await this.prisma.auditLog.create({
    data: {
      actorId: batch.processedById ?? batch.importedById,
      action: 'commission.voucher_paid',
      entityType: 'CommissionPayoutBatch',
      entityId: batch.id,
      after: {
        voucherId,
        paidRows: paidResult.count,
        totalRows: batch.totalRows,
        noAccountRows: batch.noAccountRows,
      } as never,
    },
  });

  const config = await this.settings.getConfig();
  if (config.autoSyncOnPayment) {
    try {
      await this.sync(
        batch.id,
        {},
        batch.processedById ?? batch.importedById,
      );
    } catch {
      // Sync failure is logged in CommissionPayoutSyncLog and reflected
      // in the batch status. Do not block payment completion.
    }
  }
}

  private async recountRows(batchId: string) {
    const counts = await this.prisma.commissionPayoutRow.groupBy({
      by: ['status'],
      where: { batchId },
      _count: true,
    });

    const result = { paid: 0, synced: 0, failed: 0, pending: 0, noAccount: 0 };
    for (const c of counts) {
      const key = c.status.toLowerCase() as keyof typeof result;
      if (key in result) result[key] = c._count;
    }
    return result;
  }
}