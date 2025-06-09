import { z } from 'zod';

export const scamReportSchema = z.object({
  phone: z.string().min(8, 'Phone must be at least 8 digits').max(15, 'Phone too long'),
  name: z.string().min(2, 'Name is required'),
  bank: z.string().min(2, 'Bank is required'),
  amount: z.number().min(1000, 'Amount must be at least 1,000'),
  content: z.string().min(5, 'Content is required'),
  accountNumber: z.string().optional(),
  category: z.string().optional(),
  region: z.string().optional(),
  trustScore: z.number().min(0).max(100).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type ScamReport = z.infer<typeof scamReportSchema>;
