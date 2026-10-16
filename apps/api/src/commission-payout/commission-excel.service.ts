import { Injectable, BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';

export interface ParsedRow {
  payCode: string;
  agentCode: string;
  recordCount: number;
  rate: Decimal;
  amount: Decimal;
  accountName: string;
  bank: string | null;
  sortCode: string | null;
  accountNumber: string | null;
  hasAccount: boolean;
}

export interface ParsedFile {
  dateFrom: Date;
  dateTo: Date;
  generatedAt: Date;
  rows: ParsedRow[];
  totalAmount: Decimal;
  noAccountCount: number;
}

const PAY_CODE_REGEX = /^MAJCMX[0-9]{10}X[0-9A-Z]{6}$/;

@Injectable()
export class CommissionExcelService {
  async parse(buffer: Buffer): Promise<ParsedFile> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);

    const ws = wb.worksheets.find((s) => s.name === 'Payment schedule');
    if (!ws) {
      throw new BadRequestException(
        'Sheet "Payment schedule" not found in the file.',
      );
    }

    // Row 1: Title with period
    const title = String(ws.getRow(1).getCell(1).value ?? '');
    const periodMatch = title.match(
      /(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/,
    );
    if (!periodMatch) {
      throw new BadRequestException(
        'Could not read the period from row 1 of the schedule.',
      );
    }
    const dateFrom = new Date(`${periodMatch[1]}T00:00:00+01:00`);
    const dateTo = new Date(`${periodMatch[2]}T23:59:59+01:00`);

    // Row 2: Generated at
    const genText = String(ws.getRow(2).getCell(1).value ?? '');
    const genMatch = genText.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    const generatedAt = genMatch ? new Date(`${genMatch[1]}+01:00`) : new Date();

    // Row 3: Header check
    const headerRow = ws.getRow(3);
    const expected = [
      'Pay code', 'Agent code', 'Record count', 'Rate (NGN)', 'Amount (NGN)',
      'Account name', 'Bank', 'Sort code', 'Account number',
    ];
    for (let i = 0; i < expected.length; i++) {
      const actual = String(headerRow.getCell(i + 1).value ?? '').trim();
      if (actual !== expected[i]) {
        throw new BadRequestException(
          `Column ${String.fromCharCode(65 + i)} header is "${actual}", ` +
          `expected "${expected[i]}".`,
        );
      }
    }

    // Rows 4+
    const rows: ParsedRow[] = [];
    const errors: string[] = [];
    let totalAmount = new Decimal(0);
    let noAccountCount = 0;

    for (let rowNum = 4; rowNum <= ws.rowCount; rowNum++) {
      const row = ws.getRow(rowNum);
      const colA = String(row.getCell(1).value ?? '').trim();

      if (colA.toLowerCase() === 'total') continue;
      if (!colA) continue;

      if (!PAY_CODE_REGEX.test(colA)) {
        errors.push(`Row ${rowNum}: invalid pay code "${colA}"`);
        continue;
      }

      const agentCode = String(row.getCell(2).value ?? '').trim();
      const recordCount = Number(row.getCell(3).value ?? 0);
      const rate = new Decimal(row.getCell(4).value?.toString() ?? '0');
      const amount = new Decimal(row.getCell(5).value?.toString() ?? '0');
      const accountName = String(row.getCell(6).value ?? '').trim();
      const bank = String(row.getCell(7).value ?? '').trim() || null;
      const sortCodeRaw = row.getCell(8).value;
      const sortCode = sortCodeRaw ? String(sortCodeRaw).trim() : null;
      const accountNumberRaw = row.getCell(9).value;
      const accountNumber = accountNumberRaw
        ? String(accountNumberRaw).trim().padStart(10, '0')
        : null;

      const expectedAmount = rate.times(recordCount);
      if (!amount.equals(expectedAmount)) {
        errors.push(
          `Row ${rowNum}: amount ${amount} does not equal ` +
          `${recordCount} × ${rate} = ${expectedAmount}`,
        );
        continue;
      }

      const hasAccount = !!bank && !!sortCode && !!accountNumber;
      if (!hasAccount) noAccountCount++;

      rows.push({
        payCode: colA,
        agentCode,
        recordCount,
        rate,
        amount,
        accountName,
        bank,
        sortCode,
        accountNumber,
        hasAccount,
      });

      totalAmount = totalAmount.plus(amount);
    }

    if (errors.length) {
      throw new BadRequestException({
        message: `${errors.length} problem(s) found. Nothing was imported.`,
        errors: errors.slice(0, 25),
      });
    }

    if (!rows.length) {
      throw new BadRequestException('No valid payment rows found.');
    }

    return {
      dateFrom,
      dateTo,
      generatedAt,
      rows,
      totalAmount,
      noAccountCount,
    };
  }
}