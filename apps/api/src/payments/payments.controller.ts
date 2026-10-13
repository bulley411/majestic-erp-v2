import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { RequirePermissions } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { createPaymentSchema } from './dto/schemas';

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get()
  @RequirePermissions('payment.read')
  findAll(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('batchId') batchId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.payments.findAll({ status, type, batchId, fromDate, toDate });
  }

  @Get(':id')
  @RequirePermissions('payment.read')
  findOne(@Param('id') id: string) {
    return this.payments.findOne(id);
  }

  @Post('from-voucher/:voucherId')
  @RequirePermissions('payment.create')
  createFromVoucher(
    @Param('voucherId') voucherId: string,
    @Body() body: unknown,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.payments.createFromVoucher(
      voucherId,
      createPaymentSchema.parse(body),
      actorId,
    );
  }

  @Delete(':id')
  @RequirePermissions('payment.create')
  remove(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.payments.remove(id, actorId);
  }
}