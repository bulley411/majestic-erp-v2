// apps/api/src/app.module.ts
import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma.module';
import { PrismaService } from './common/prisma.service';
import { EmployeesModule } from './employees/employees.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, Public } from './auth/auth.guard';
import { DocumentsModule } from './documents/documents.module';
import { OrgModule } from './org/org.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PayrollModule } from './payroll/payroll.module';
import { LedgerModule } from './ledger/ledger.module';
import { VendorsModule } from './vendors/vendors.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { BudgetsModule } from './budgets/budgets.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { BanksModule } from './banks/banks.module';
import { PaymentsModule } from './payments/payments.module';
import { CommissionPayoutModule } from './commission-payout/commission-payout.module'; // ← ADD

@Controller('health')
class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'connected', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    EmployeesModule,
    DocumentsModule,
    OrgModule,
    AttendanceModule,
    PayrollModule,
    LedgerModule,
    VendorsModule,
    VouchersModule,
    BudgetsModule,
    ExpenseCategoriesModule,
    BanksModule,
    PaymentsModule,
    CommissionPayoutModule, // ← ADD
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}