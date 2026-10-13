import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const PAYABLE_META: Record<string, {
  label: string;
  description: string;
  expectedType: 'LIABILITY';
}> = {
  VOUCHER_DEFAULT: {
    label: 'Voucher default payable',
    description: 'Default payable account used when a general voucher is paid',
    expectedType: 'LIABILITY',
  },
  COMMISSION_PAYOUT: {
    label: 'Commission payout payable',
    description: 'Payable account used when a commission batch is paid',
    expectedType: 'LIABILITY',
  },
};

const REQUIRED_KEYS = Object.keys(PAYABLE_META);

@Injectable()
export class PaymentPayableConfigService {
  constructor(private prisma: PrismaService) {}

  async getAll() {
    const rows = await this.prisma.paymentPayableConfig.findMany({
      include: { account: true },
    });

    const byKey = new Map(rows.map((r) => [r.key, r]));
    const result: Record<string, any> = {};

    for (const key of REQUIRED_KEYS) {
      const row = byKey.get(key as any);
      result[key] = {
        key,
        accountId: row?.accountId ?? null,
        accountCode: row?.account?.code ?? null,
        accountName: row?.account?.name ?? null,
        accountType: row?.account?.type ?? null,
        isConfigured: !!row,
        meta: PAYABLE_META[key],
      };
    }

    return result;
  }

  async getRequired(key: string) {
    const config = await this.prisma.paymentPayableConfig.findUnique({
      where: { key: key as any },
      include: { account: true },
    });

    if (!config) {
      throw new BadRequestException(
        `Payable account "${PAYABLE_META[key]?.label ?? key}" is not configured. ` +
        `Please set it in Settings → Finance settings → Payment payables.`,
      );
    }

    if (!config.account.isActive) {
      throw new BadRequestException(
        `Payable account "${config.account.code} - ${config.account.name}" is inactive. ` +
        `Please activate it or reconfigure in Settings → Finance settings → Payment payables.`,
      );
    }

    return config;
  }

  async verify() {
    const missing: string[] = [];
    for (const key of REQUIRED_KEYS) {
      const config = await this.prisma.paymentPayableConfig.findUnique({
        where: { key: key as any },
      });
      if (!config) missing.push(PAYABLE_META[key].label);
    }
    return {
      allConfigured: missing.length === 0,
      missing,
    };
  }

  async set(key: string, accountId: string, actorId: string) {
    if (!REQUIRED_KEYS.includes(key)) {
      throw new BadRequestException(`Unknown payment payable key: ${key}`);
    }

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
    });

    const expectedType = PAYABLE_META[key].expectedType;
    if (account.type !== expectedType) {
      throw new BadRequestException(
        `"${PAYABLE_META[key].label}" expects a ${expectedType} account, ` +
        `but ${account.code} - ${account.name} is ${account.type}.`,
      );
    }

    const config = await this.prisma.paymentPayableConfig.upsert({
      where: { key: key as any },
      update: { accountId, updatedById: actorId },
      create: { key: key as any, accountId, updatedById: actorId },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'payment_payable_config.updated',
        entityType: 'PaymentPayableConfig',
        entityId: config.id,
        after: { key, accountCode: account.code } as never,
      },
    });

    return config;
  }
}