import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentBatchesController } from './payment-batches.controller';
import { PaymentBatchesService } from './payment-batches.service';
import { BankFileService } from './bank-file.service';
import { PaymentPayableConfigController } from './payment-payable-config.controller';
import { PaymentPayableConfigService } from './payment-payable-config.service';
import { PayrollModule } from '../payroll/payroll.module';
import { CommissionPayoutModule } from '../commission-payout/commission-payout.module';



@Module({
  imports: [PayrollModule,CommissionPayoutModule],
  controllers: [
    PaymentsController,
    PaymentBatchesController,
    PaymentPayableConfigController,
  ],
  providers: [
    PaymentsService,
    PaymentBatchesService,
    BankFileService,
    PaymentPayableConfigService,
  ],
  exports: [PaymentsService, PaymentBatchesService, PaymentPayableConfigService],
})
export class PaymentsModule {}