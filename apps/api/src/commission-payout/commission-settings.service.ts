import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface CommissionConfig {
  enabled: boolean;
  baseUrl: string;
  sharedSecret: string;
  autoSyncOnPayment: boolean;
}

const SETTINGS_KEY = 'commission_payout_config';

const DEFAULT_CONFIG: CommissionConfig = {
  enabled: false,
  baseUrl: '',
  sharedSecret: '',
  autoSyncOnPayment: false,
};

@Injectable()
export class CommissionSettingsService {
  constructor(private prisma: PrismaService) {}

  async getConfig(): Promise<CommissionConfig> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });

    if (!row) return { ...DEFAULT_CONFIG };

    return { ...DEFAULT_CONFIG, ...(row.value as Partial<CommissionConfig>) };
  }

  async getConfigMasked() {
    const config = await this.getConfig();
    return {
      enabled: config.enabled,
      baseUrl: config.baseUrl,
      autoSyncOnPayment: config.autoSyncOnPayment,
      hasSecret: !!config.sharedSecret,
      sharedSecretHint: config.sharedSecret
        ? '••••' + config.sharedSecret.slice(-4)
        : '',
    };
  }

  async updateConfig(data: Partial<CommissionConfig>, actorId: string) {
    const before = await this.getConfig();
    const updated = { ...before, ...data };

    // Don't overwrite the secret with an empty string
    if (data.sharedSecret === '' || data.sharedSecret === undefined) {
      updated.sharedSecret = before.sharedSecret;
    }

    await this.prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: updated as never },
      create: { key: SETTINGS_KEY, value: updated as never },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'commission_config.updated',
        entityType: 'SystemSetting',
        entityId: SETTINGS_KEY,
        before: {
          ...before,
          sharedSecret: before.sharedSecret ? '***' : '',
        } as never,
        after: {
          ...updated,
          sharedSecret: updated.sharedSecret ? '***' : '',
        } as never,
      },
    });

    return updated;
  }

  async isEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config.enabled;
  }
}