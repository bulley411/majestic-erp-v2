import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PaymentBatchesService } from './payment-batches.service';
import { RequirePermissions } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { readStoredFile } from '../documents/storage';
import {
  createBatchSchema,
  addPaymentsSchema,
  markPaidSchema,
} from './dto/schemas';

@Controller('payment-batches')
export class PaymentBatchesController {
  constructor(private batches: PaymentBatchesService) {}

  @Get()
  @RequirePermissions('payment.read')
  findAll(@Query('status') status?: string) {
    return this.batches.findAll({ status });
  }

  @Get(':id')
  @RequirePermissions('payment.read')
  findOne(@Param('id') id: string) {
    return this.batches.findOne(id);
  }

  @Post()
  @RequirePermissions('payment.create')
  create(@Body() body: unknown, @CurrentUser('sub') actorId: string) {
    return this.batches.create(createBatchSchema.parse(body), actorId);
  }

  @Post(':id/payments')
  @RequirePermissions('payment.create')
  addPayments(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.batches.addPayments(id, addPaymentsSchema.parse(body), actorId);
  }

  @Delete(':id/payments/:paymentId')
  @RequirePermissions('payment.create')
  removePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.batches.removePayment(id, paymentId, actorId);
  }

  @Post(':id/generate-file')
  @RequirePermissions('payment.create')
  generateFile(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.batches.generateBankFile(id, actorId);
  }

  @Get(':id/download')
  @RequirePermissions('payment.read')
  async download(@Param('id') id: string, @Res() res: Response) {
    const batch = await this.batches.findOne(id);
    if (!batch.bankFileStoredName) {
      res.status(404).json({ message: 'No bank file generated yet.' });
      return;
    }
    const buffer = await readStoredFile(batch.bankFileStoredName);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${batch.bankFileOriginalName}"`,
    );
    res.send(buffer);
  }

  @Post(':id/submit')
  @RequirePermissions('payment.execute')
  submit(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.batches.submitToBank(id, actorId);
  }

  @Post(':id/mark-paid')
  @RequirePermissions('payment.execute')
  markPaid(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.batches.markPaid(id, markPaidSchema.parse(body), actorId);
  }

  @Delete(':id')
  @RequirePermissions('payment.create')
  discard(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.batches.discard(id, actorId);
  }
}