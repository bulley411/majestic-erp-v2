import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CommissionSettingsService } from './commission-settings.service';
import { createHmac } from 'node:crypto';

export interface WebhookPayment {
  payCode: string;
  reference: string;
  occurredAt: Date;
}

export interface WebhookResponse {
  status: string;
  applied: number;
  ignored: number;
  rejected: { index: number; pay_code: string | null; error: string }[];
}

@Injectable()
export class CommissionWebhookService {
  constructor(
    private prisma: PrismaService,
    private settings: CommissionSettingsService,
  ) {}

  async notifyPayments(
    batchId: string,
    payments: WebhookPayment[],
    rowIds?: string[],
  ): Promise<WebhookResponse> {
    const config = await this.settings.getConfig();
    if (!config.enabled) {
      throw new BadRequestException(
        'Commission payout integration is not enabled.',
      );
    }
    if (!config.baseUrl || !config.sharedSecret) {
      throw new BadRequestException(
        'Commission integration is missing a Base URL or Shared Secret.',
      );
    }

    const body = JSON.stringify({
      results: payments.map((p) => ({
        pay_code: p.payCode,
        reference: p.reference,
        occurred_at: p.occurredAt.toISOString(),
      })),
    });

    const signature = createHmac('sha512', config.sharedSecret)
      .update(body)
      .digest('hex');

    const url = `${config.baseUrl}/api/v1/webhook/payment-schedules/payouts`;
    const started = Date.now();
    let statusCode = 0;
    let responseBody: any = null;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': signature,
        },
        body,
      });
      statusCode = response.status;

      const text = await response.text();
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = { raw: text };
      }

      await this.prisma.commissionPayoutSyncLog.create({
        data: {
          batchId,
          action: rowIds?.length === 1 ? 'ROW_RETRY' : 'BATCH_SYNC',
          requestBody: JSON.parse(body) as never,
          responseBody: responseBody as never,
          statusCode,
          success: response.ok,
          durationMs: Date.now() - started,
        },
      });

      if (!response.ok) {
        if (statusCode === 401) {
          throw new Error(
            'Webhook signature rejected (401). Check the shared secret.',
          );
        }
        throw new Error(`Webhook returned ${statusCode}.`);
      }

      return responseBody as WebhookResponse;
    } catch (e) {
      errorMessage = (e as Error).message;

      await this.prisma.commissionPayoutSyncLog.create({
        data: {
          batchId,
          action: rowIds?.length === 1 ? 'ROW_RETRY' : 'BATCH_SYNC',
          requestBody: JSON.parse(body) as never,
          statusCode,
          success: false,
          errorMessage,
          durationMs: Date.now() - started,
        },
      });

      throw e;
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const config = await this.settings.getConfig();
    if (!config.baseUrl || !config.sharedSecret) {
      return { ok: false, message: 'Base URL or Shared Secret not configured.' };
    }

    const body = JSON.stringify({ results: [] });
    const signature = createHmac('sha512', config.sharedSecret)
      .update(body)
      .digest('hex');

    const url = `${config.baseUrl}/api/v1/webhook/payment-schedules/payouts`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': signature,
        },
        body,
      });

      if (response.ok) {
        return { ok: true, message: `Connected (HTTP ${response.status}).` };
      }
      if (response.status === 401) {
        return {
          ok: false,
          message: 'Connected, but signature rejected (401). Check shared secret.',
        };
      }
      return { ok: false, message: `Connected, but HTTP ${response.status}.` };
    } catch (e) {
      return { ok: false, message: `Network error: ${(e as Error).message}` };
    }
  }
}