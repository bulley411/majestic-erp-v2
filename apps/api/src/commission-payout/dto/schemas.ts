import { z } from 'zod';

export const importSchema = z.object({
  requireEdApproval: z.coerce.boolean().default(true),
  requireMdApproval: z.coerce.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
});

export const processSchema = z.object({
  categoryId: z.string().uuid().optional(),
  bankId: z.string().uuid().optional(),
});

export const syncSchema = z.object({
  rowIds: z.array(z.string().uuid()).optional(),
});

export const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  baseUrl: z.string().trim().optional(),
  sharedSecret: z.string().trim().optional(),
  autoSyncOnPayment: z.boolean().optional(),
});