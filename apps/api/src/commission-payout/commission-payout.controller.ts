import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommissionPayoutService } from './commission-payout.service';
import { CommissionSettingsService } from './commission-settings.service';
import { CommissionWebhookService } from './commission-webhook.service';
import { RequirePermissions } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  importSchema,
  processSchema,
  syncSchema,
  settingsSchema,
} from './dto/schemas';

@Controller('commission-payouts')
export class CommissionPayoutController {
  constructor(
    private service: CommissionPayoutService,
    private settings: CommissionSettingsService,
    private webhook: CommissionWebhookService,
  ) {}

  /* Settings */
  @Get('settings')
  @RequirePermissions('commission.read')
  getSettings() {
    return this.settings.getConfigMasked();
  }

  @Patch('settings')
  @RequirePermissions('commission.manage')
  updateSettings(@Body() body: unknown, @CurrentUser('sub') actorId: string) {
    return this.settings.updateConfig(settingsSchema.parse(body), actorId);
  }

  @Post('settings/test-webhook')
  @RequirePermissions('commission.manage')
  testWebhook() {
    return this.webhook.testConnection();
  }

  /* Batches */
  @Get()
  @RequirePermissions('commission.read')
  findAll(@Query('status') status?: string) {
    return this.service.findAll({ status });
  }

  @Get(':id')
  @RequirePermissions('commission.read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('import')
  @RequirePermissions('commission.import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  import(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body() body: unknown,
    @CurrentUser('sub') actorId: string,
  ) {
    if (!file) throw new BadRequestException('No file received.');
    return this.service.import(
      file.buffer,
      file.originalname,
      importSchema.parse(body),
      actorId,
    );
  }

  @Post(':id/process')
  @RequirePermissions('commission.process')
  process(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.service.process(id, processSchema.parse(body), actorId);
  }

  @Post(':id/sync')
  @RequirePermissions('commission.process')
  sync(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.service.sync(id, syncSchema.parse(body), actorId);
  }

  @Post(':id/rows/:rowId/retry')
  @RequirePermissions('commission.process')
  retryRow(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.service.retryRow(id, rowId, actorId);
  }

  @Delete(':id')
  @RequirePermissions('commission.import')
  cancel(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.service.cancel(id, actorId);
  }
}