import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';

@Injectable()
export class BankFileService {
  constructor(private prisma: PrismaService) {}

  async generateExcel(batchId: string): Promise<Buffer> {
    const batch = await this.prisma.paymentBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: {
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Payment Instructions');

    // Title rows
    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = `Payment Batch ${batch.reference}`;
    ws.getCell('A1').font = { bold: true, size: 14 };

    ws.mergeCells('A2:H2');
    ws.getCell('A2').value = `Generated: ${new Date().toISOString()}`;
    ws.getCell('A2').font = {
      italic: true,
      size: 10,
      color: { argb: 'FF5D7085' },
    };

    ws.mergeCells('A3:H3');
    ws.getCell('A3').value = batch.description;
    ws.getCell('A3').font = { size: 11 };

    // Headers on row 5
    const headers = [
      'S/N',
      'Beneficiary Name',
      'Account Number',
      'Bank Name',
      'Bank Code',
      'Amount (NGN)',
      'Narration',
      'Reference',
    ];

    const headerRow = ws.getRow(5);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0B2239' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD8E0E8' } },
        bottom: { style: 'thin', color: { argb: 'FFD8E0E8' } },
        left: { style: 'thin', color: { argb: 'FFD8E0E8' } },
        right: { style: 'thin', color: { argb: 'FFD8E0E8' } },
      };
    });
    headerRow.height = 22;

    // Column widths
    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 32;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 22;
    ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 18;
    ws.getColumn(7).width = 40;
    ws.getColumn(8).width = 24;

    // Data rows
    let sn = 1;
    let total = new Decimal(0);
    let rowNum = 6;

    for (const p of batch.payments) {
      const row = ws.getRow(rowNum);
      row.getCell(1).value = sn++;
      row.getCell(2).value = p.beneficiaryAccountName ?? p.payeeName;
      row.getCell(3).value = p.beneficiaryAccount ?? '';
      row.getCell(4).value = p.beneficiaryBank ?? '';
      row.getCell(5).value = p.beneficiaryBankCode ?? '';
      row.getCell(6).value = Number(p.netAmount.toString());
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(7).value = (p.description ?? '').slice(0, 50);
      row.getCell(8).value = p.reference;

      row.getCell(6).alignment = { horizontal: 'right' };

      total = total.plus(p.netAmount.toString());
      rowNum++;
    }

    // Total row
    const totalRow = ws.getRow(rowNum);
    totalRow.getCell(2).value = 'TOTAL';
    totalRow.getCell(2).font = { bold: true };
    totalRow.getCell(6).value = Number(total.toFixed(2));
    totalRow.getCell(6).numFmt = '#,##0.00';
    totalRow.getCell(6).font = { bold: true };
    totalRow.getCell(6).alignment = { horizontal: 'right' };
    totalRow.getCell(7).value = `${batch.payments.length} payment(s)`;

    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}