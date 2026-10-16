import { Module } from '@nestjs/common';
import { CommissionPayoutController } from './commission-payout.controller';
import { CommissionPayoutService } from './commission-payout.service';
import { CommissionExcelService } from './commission-excel.service';
import { CommissionWebhookService } from './commission-webhook.service';
import { CommissionSettingsService } from './commission-settings.service';

@Module({
  controllers: [CommissionPayoutController],
  providers: [
    CommissionPayoutService,
    CommissionExcelService,
    CommissionWebhookService,
    CommissionSettingsService,
  ],
  exports: [CommissionPayoutService, CommissionSettingsService],
})
export class CommissionPayoutModule {}