import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { z } from 'zod';
import { PaymentPayableConfigService } from './payment-payable-config.service';
import { RequirePermissions } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

const setSchema = z.object({
  accountId: z.string().uuid('Select an account'),
});

@Controller('payment-payable-config')
export class PaymentPayableConfigController {
  constructor(private config: PaymentPayableConfigService) {}

  @Get()
  @RequirePermissions('payment.read')
  getAll() {
    return this.config.getAll();
  }

  @Get('verify')
  @RequirePermissions('payment.read')
  verify() {
    return this.config.verify();
  }

  @Patch(':key')
  @RequirePermissions('settings.manage')
  set(
    @Param('key') key: string,
    @Body() body: unknown,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.config.set(key, setSchema.parse(body).accountId, actorId);
  }
}