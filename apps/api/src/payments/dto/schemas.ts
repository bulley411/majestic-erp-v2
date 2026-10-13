import { z } from 'zod';

export const createPaymentSchema = z.object({
  bankId: z.string().uuid().optional(),
  beneficiaryBank: z.string().trim().max(60).optional(),
  beneficiaryBankCode: z.string().trim().max(10).optional(),
  beneficiaryAccount: z.string().trim().max(20).optional(),
  beneficiaryAccountName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const createBatchSchema = z.object({
  description: z.string().trim().min(3).max(200),
});

export const addPaymentsSchema = z.object({
  paymentIds: z.array(z.string().uuid()).min(1, 'Select at least one payment'),
});

export const markPaidSchema = z.object({
  paidAt: z.coerce.date(),
  externalReference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});