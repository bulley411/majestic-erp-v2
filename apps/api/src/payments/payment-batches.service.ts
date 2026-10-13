import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaymentsService } from './payments.service';
import { BankFileService } from './bank-file.service';
import Decimal from 'decimal.js';
import { z } from 'zod';
import {
  createBatchSchema,
  addPaymentsSchema,
  markPaidSchema,
} from './dto/schemas';
import { saveFile, checksum } from '../documents/storage';

@Injectable()
export class PaymentBatchesService {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private bankFile: BankFileService,
  ) {}

  async findAll(filters: { status?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;

    return this.prisma.paymentBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { payments: true } },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.paymentBatch.findUniqueOrThrow({
      where: { id },
      include: {
        payments: {
          include: {
            voucher: { select: { id: true, voucherNo: true } },
            bank: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async create(data: z.infer<typeof createBatchSchema>, actorId: string) {
    const count = await this.prisma.paymentBatch.count();
    const year = new Date().getUTCFullYear();
    const reference = `MAPA/BATCH/${year}/${String(count + 1).padStart(3, '0')}`;

    return this.prisma.paymentBatch.create({
      data: {
        reference,
        description: data.description,
        status: 'DRAFT',
        createdById: actorId,
      },
    });
  }

  async addPayments(
    batchId: string,
    data: z.infer<typeof addPaymentsSchema>,
    actorId: string,
  ) {
    const batch = await this.prisma.paymentBatch.findUniqueOrThrow({
      where: { id: batchId },
    });

    if (batch.status !== 'DRAFT') {
      throw new BadRequestException(
        `Only DRAFT batches can accept payments. Current: ${batch.status}.`,
      );
    }

    const payments = await this.prisma.payment.findMany({
      where: { id: { in: data.paymentIds } },
    });

    if (payments.length !== data.paymentIds.length) {
      throw new BadRequestException('One or more payments not found.');
    }

    const invalid = payments.filter(
      (p) => p.status !== 'PENDING' || p.batchId !== null,
    );
    if (invalid.length) {
      throw new BadRequestException(
        `Payments must be PENDING and unbatched. Invalid: ${invalid
          .map((p) => p.reference)
          .join(', ')}`,
      );
    }

    // Verify payable accounts for all payment types present
    const types = [...new Set(payments.map((p) => p.type))];
    for (const type of types) {
      await this.payments.verifyPayableForType(type);
    }

    const total = payments.reduce(
      (sum, p) => sum.plus(p.netAmount.toString()),
      new Decimal(0),
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { id: { in: data.paymentIds } },
        data: { batchId, status: 'BATCHED' },
      });

      const updated = await tx.paymentBatch.update({
        where: { id: batchId },
        data: {
          paymentCount: { increment: payments.length },
          totalAmount: { increment: total.toFixed(4) },
        },
      });

      for (const p of payments) {
        await tx.paymentHistory.create({
          data: {
            paymentId: p.id,
            action: 'BATCHED',
            actorId,
            remarks: `Added to batch ${batch.reference}`,
          },
        });
      }

      return updated;
    });
  }

  async removePayment(batchId: string, paymentId: string, actorId: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    if (payment.batchId !== batchId) {
      throw new BadRequestException('Payment is not in this batch.');
    }

    if (payment.status !== 'BATCHED') {
      throw new BadRequestException(
        `Cannot remove payment with status ${payment.status}.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { batchId: null, status: 'PENDING' },
      });

      const updated = await tx.paymentBatch.update({
        where: { id: batchId },
        data: {
          paymentCount: { decrement: 1 },
          totalAmount: { decrement: payment.netAmount.toString() },
        },
      });

      await tx.paymentHistory.create({
        data: {
          paymentId,
          action: 'REMOVED_FROM_BATCH',
          actorId,
        },
      });

      return updated;
    });
  }

  async generateBankFile(batchId: string, actorId: string) {
    const batch = await this.prisma.paymentBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { payments: true },
    });

    if (!batch.payments.length) {
      throw new BadRequestException('Batch has no payments.');
    }

    if (batch.bankFileGeneratedAt) {
      throw new BadRequestException(
        'Bank file already generated. Discard and recreate to regenerate.',
      );
    }

    const buffer = await this.bankFile.generateExcel(batchId);
    const storedName = await saveFile(
      buffer,
      `batch-${batch.reference}.xlsx`,
    );
    const hash = checksum(buffer);

    const updated = await this.prisma.paymentBatch.update({
      where: { id: batchId },
      data: {
        status: 'READY',
        bankFileGeneratedAt: new Date(),
        bankFileStoredName: storedName,
        bankFileOriginalName: `batch-${batch.reference}.xlsx`,
        bankFileHash: hash,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'payment_batch.file_generated',
        entityType: 'PaymentBatch',
        entityId: batchId,
        after: {
          storedName,
          payments: batch.payments.length,
        } as never,
      },
    });

    return updated;
  }

  async submitToBank(batchId: string, actorId: string) {
    const batch = await this.prisma.paymentBatch.findUniqueOrThrow({
      where: { id: batchId },
    });

    if (batch.status !== 'READY') {
      throw new BadRequestException(
        `Only READY batches can be submitted. Current: ${batch.status}.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { batchId },
        data: { status: 'SENT' },
      });

      const updated = await tx.paymentBatch.update({
        where: { id: batchId },
        data: {
          status: 'SENT',
          submittedAt: new Date(),
          submittedById: actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'payment_batch.submitted',
          entityType: 'PaymentBatch',
          entityId: batchId,
          after: { status: 'SENT' } as never,
        },
      });

      return updated;
    });
  }

  async markPaid(
  batchId: string,
  data: z.infer<typeof markPaidSchema>,
  actorId: string,
) {
  const batch = await this.prisma.paymentBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      payments: {
        include: {
          voucher: { select: { id: true, voucherNo: true, status: true } },
          bank: { include: { account: true } },
        },
      },
    },
  });

  if (batch.status !== 'SENT') {
    throw new BadRequestException(
      `Only SENT batches can be marked paid. Current: ${batch.status}.`,
    );
  }

  const paidAt = new Date(data.paidAt);

  const period = await this.prisma.fiscalPeriod.findUnique({
    where: {
      year_month: {
        year: paidAt.getUTCFullYear(),
        month: paidAt.getUTCMonth() + 1,
      },
    },
  });

  if (!period) {
    throw new BadRequestException('Fiscal period not found for this date.');
  }
  if (period.isClosed) {
    throw new BadRequestException('Fiscal period is closed.');
  }

  // Pre-flight: resolve all payable accounts and bank accounts
  const payableByPayment = new Map<
    string,
    { accountId: string; key: string }
  >();
  for (const payment of batch.payments) {
    const resolved = await this.payments.resolvePayableAccount(payment);
    payableByPayment.set(payment.id, resolved);

    if (!payment.bank?.account?.id) {
      throw new BadRequestException(
        `Payment ${payment.reference} has no bank account configured.`,
      );
    }
  }

  return this.prisma.$transaction(async (tx) => {
    for (const payment of batch.payments) {
      const resolved = payableByPayment.get(payment.id)!;

      const entry = await tx.journalEntry.create({
        data: {
          reference: `JV/PAY/${payment.reference}`,
          date: paidAt,
          narration: `Payment of ${payment.reference}`,
          sourceType: 'payment',
          sourceId: payment.id,
          status: 'POSTED',
          periodId: period.id,
          postedById: actorId,
          postedAt: new Date(),
          lines: {
            create: [
              {
                accountId: resolved.accountId,
                debit: payment.netAmount.toString(),
                credit: '0.0000',
                narration: `Settle ${resolved.key
                  .replace(/_/g, ' ')
                  .toLowerCase()} for ${payment.reference}`,
                sortOrder: 0,
              },
              {
                accountId: payment.bank!.account!.id,
                debit: '0.0000',
                credit: payment.netAmount.toString(),
                narration: `Payment via ${payment.bank!.name}`,
                sortOrder: 1,
              },
            ],
          },
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          paidAt,
          externalReference: data.externalReference,
          journalEntryId: entry.id,
          recordedById: actorId,
          recordedAt: new Date(),
        },
      });

      if (payment.voucherId) {
        await tx.voucher.update({
          where: { id: payment.voucherId },
          data: { status: 'PAID' as any },
        });
      }

      await tx.paymentHistory.create({
        data: {
          paymentId: payment.id,
          action: 'PAID',
          actorId,
          remarks: `Marked paid via batch ${batch.reference}`,
        },
      });
    }

    const updated = await tx.paymentBatch.update({
      where: { id: batchId },
      data: {
        status: 'PAID',
        completedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'payment_batch.paid',
        entityType: 'PaymentBatch',
        entityId: batchId,
        after: {
          status: 'PAID',
          externalReference: data.externalReference,
          paidAt: paidAt.toISOString(),
        } as never,
      },
    });

    return { batch: updated, paidCount: batch.payments.length };
  });
}

  async discard(batchId: string, actorId: string) {
    const batch = await this.prisma.paymentBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { payments: true },
    });

    if (batch.status !== 'DRAFT') {
      throw new BadRequestException(
        `Only DRAFT batches can be discarded. Current: ${batch.status}.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { batchId },
        data: { batchId: null, status: 'PENDING' },
      });

      for (const p of batch.payments) {
        await tx.paymentHistory.create({
          data: {
            paymentId: p.id,
            action: 'BATCH_DISCARDED',
            actorId,
          },
        });
      }

      await tx.paymentBatch.delete({ where: { id: batchId } });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'payment_batch.discarded',
          entityType: 'PaymentBatch',
          entityId: batchId,
          before: { reference: batch.reference } as never,
        },
      });

      return { ok: true };
    });
  }
}