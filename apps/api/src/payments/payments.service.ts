import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaymentPayableConfigService } from './payment-payable-config.service';
import { PayrollSettingsService } from '../payroll/payroll-settings.service';
import { z } from 'zod';
import { createPaymentSchema } from './dto/schemas';
import { CommissionPayoutService } from '../commission-payout/commission-payout.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private paymentPayableConfig: PaymentPayableConfigService,
    private payrollSettings: PayrollSettingsService,
    private commission: CommissionPayoutService,   // ← ADD
  ) {}

  async findAll(filters: {
    status?: string;
    type?: string;
    batchId?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.batchId) where.batchId = filters.batchId;
    if (filters.fromDate) where.createdAt = { gte: new Date(filters.fromDate) };
    if (filters.toDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(filters.toDate) };
    }

    return this.prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        voucher: { select: { id: true, voucherNo: true, description: true } },
        batch: { select: { id: true, reference: true, status: true } },
        bank: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.payment.findUniqueOrThrow({
      where: { id },
      include: {
        voucher: {
          select: {
            id: true,
            voucherNo: true,
            description: true,
            beneficiary: true,
          },
        },
        batch: { select: { id: true, reference: true, status: true } },
        bank: true,
        journalEntry: {
          include: { lines: { include: { account: true } } },
        },
        history: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  /**
   * Verify the required payable account for a given payment type.
   */
  async verifyPayableForType(type: string) {
    switch (type) {
      case 'COMMISSION':
        await this.paymentPayableConfig.getRequired('COMMISSION_PAYOUT');
        return;
      case 'PAYROLL_NET':
        await this.payrollSettings.getRequired('NET_SALARIES_PAYABLE');
        return;
      case 'PAYROLL_PAYE':
        await this.payrollSettings.getRequired('PAYE_PAYABLE');
        return;
      case 'PAYROLL_PENSION':
        await this.payrollSettings.getRequired('PENSION_PAYABLE');
        return;
      case 'PAYROLL_NHF':
        await this.payrollSettings.getRequired('NHF_PAYABLE');
        return;
      default:
        await this.paymentPayableConfig.getRequired('VOUCHER_DEFAULT');
        return;
    }
  }

 async createFromVoucher(
  voucherId: string,
  data: z.infer<typeof createPaymentSchema>,
  actorId: string,
) {
  const voucher = await this.prisma.voucher.findUniqueOrThrow({
    where: { id: voucherId },
    include: { vendor: true, category: true },
  });

  if (voucher.status !== 'APPROVED') {
    throw new BadRequestException(
      `Only APPROVED vouchers can be paid. Current: ${voucher.status}.`,
    );
  }
// ⬇️ ADD THIS BLOCK ⬇️
  const existingPayment = await this.prisma.payment.findFirst({
    where: {
      voucherId: voucher.id,
      status: { in: ['PENDING', 'BATCHED', 'SENT', 'PAID'] },
    },
  });
  if (existingPayment) {
    throw new BadRequestException(
      `A payment (${existingPayment.reference}) already exists for this voucher. ` +
      `Delete it first or view it in Finance → Payments.`,
    );
  }
  // ⬆️ END ADD ⬆️
  // Detect commission voucher via batch relation
const commissionBatch = await this.prisma.commissionPayoutBatch.findFirst({
  where: { voucherId: voucherId },
  select: { id: true },
});
const type = commissionBatch ? 'COMMISSION' : 'VOUCHER';
  await this.verifyPayableForType(type);

  const count = await this.prisma.payment.count();
  const year = new Date().getUTCFullYear();
  const reference = `MAPA/PAY/${year}/${String(count + 1).padStart(3, '0')}`;

  const beneficiaryBank =
    voucher.vendor?.bankName ?? data.beneficiaryBank ?? null;
  const beneficiaryAccount =
    voucher.vendor?.accountNumber ?? data.beneficiaryAccount ?? null;
  const beneficiaryAccountName =
    data.beneficiaryAccountName ?? voucher.beneficiary;
  const beneficiaryBankCode = data.beneficiaryBankCode ?? null;

  const payment = await this.prisma.payment.create({
    data: {
      reference,
      voucherId: voucher.id,
      type,
      payeeType: 'VENDOR',
      payeeId: voucher.vendorId,
      payeeName: voucher.beneficiary,
      description: voucher.description,
      amount: voucher.amount.toString(),
      whtAmount: voucher.whtAmount.toString(),
      netAmount: voucher.netAmount.toString(),
      beneficiaryBank,
      beneficiaryBankCode,
      beneficiaryAccount,
      beneficiaryAccountName,
      bankId: data.bankId ?? voucher.bankId,
      status: 'PENDING',
      createdById: actorId,
      notes: data.notes,
    },
  });

  await this.prisma.paymentHistory.create({
    data: {
      paymentId: payment.id,
      action: 'CREATED',
      actorId,
      remarks: `Created from voucher ${voucher.voucherNo}`,
    },
  });

  await this.prisma.auditLog.create({
    data: {
      actorId,
      action: 'payment.created',
      entityType: 'Payment',
      entityId: payment.id,
      after: {
        reference: payment.reference,
        voucherNo: voucher.voucherNo,
        amount: payment.netAmount.toString(),
      } as never,
    },
  });

  return payment;   // ← ADD THIS
}

  async remove(id: string, actorId: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id },
    });

    if (payment.status !== 'PENDING') {
      throw new BadRequestException(
        `Only PENDING payments can be deleted. Current: ${payment.status}.`,
      );
    }

    await this.prisma.payment.delete({ where: { id } });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'payment.deleted',
        entityType: 'Payment',
        entityId: id,
        before: { reference: payment.reference } as never,
      },
    });

    return { ok: true };
  }

  /**
   * Resolve the payable account ID for a payment based on its type.
   * Used by PaymentBatchesService during markPaid.
   */
  async resolvePayableAccount(payment: {
    type: string;
  }): Promise<{ accountId: string; key: string }> {
    switch (payment.type) {
      case 'COMMISSION': {
        const cfg = await this.paymentPayableConfig.getRequired(
          'COMMISSION_PAYOUT',
        );
        return { accountId: cfg.accountId, key: 'COMMISSION_PAYOUT' };
      }
      case 'PAYROLL_NET': {
        const cfg = await this.payrollSettings.getRequired('NET_SALARIES_PAYABLE');
        return { accountId: cfg.accountId, key: 'NET_SALARIES_PAYABLE' };
      }
      case 'PAYROLL_PAYE': {
        const cfg = await this.payrollSettings.getRequired('PAYE_PAYABLE');
        return { accountId: cfg.accountId, key: 'PAYE_PAYABLE' };
      }
      case 'PAYROLL_PENSION': {
        const cfg = await this.payrollSettings.getRequired('PENSION_PAYABLE');
        return { accountId: cfg.accountId, key: 'PENSION_PAYABLE' };
      }
      case 'PAYROLL_NHF': {
        const cfg = await this.payrollSettings.getRequired('NHF_PAYABLE');
        return { accountId: cfg.accountId, key: 'NHF_PAYABLE' };
      }
      default: {
        const cfg = await this.paymentPayableConfig.getRequired('VOUCHER_DEFAULT');
        return { accountId: cfg.accountId, key: 'VOUCHER_DEFAULT' };
      }
    }
  }
}