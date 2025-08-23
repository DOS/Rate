import { z } from 'zod';

// Base schema chung cho mọi nguồn
export const baseSchema = z.object({
  // Core fields
  phone: z.string().min(8, 'Phone must be at least 8 digits').max(15, 'Phone too long').optional(),
  name: z.string().min(2, 'Name is required').optional(),
  bank: z.string().min(2, 'Bank is required').optional(),
  bank_account: z.string().optional(),
  amount: z.number().min(1000, 'Amount must be at least 1,000').optional(),
  content: z.string().min(5, 'Content is required').optional(),
  
  // Additional fields
  email: z.string().email().optional(),
  facebook: z.string().optional(),
  zalo: z.string().optional(),
  website: z.string().url().optional(),
  
  // Location
  province: z.string().optional(),
  district: z.string().optional(),
  
  // Metadata
  category: z.string().optional(),
  evidence_images: z.array(z.string()).optional(),
  reported_date: z.string().datetime().optional(),
  
  // System fields
  source: z.enum(['checkscam', 'extension', 'manual', 'import']).optional(),
  status: z.enum(['pending', 'verified', 'rejected']).optional(),
  trustScore: z.number().min(0).max(100).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// Schema cho từng nguồn
export const checkscamSchema = baseSchema.extend({
  source: z.literal('checkscam'),
  checkscam_id: z.string(),
  checkscam_url: z.string().url(),
  views: z.number().optional(),
  comments_count: z.number().optional(),
});

export const extensionSchema = baseSchema.extend({
  source: z.literal('extension'),
  user_agent: z.string(),
  page_url: z.string().url(),
  detected_at: z.string().datetime(),
});

export const manualSchema = baseSchema.extend({
  source: z.literal('manual'),
  reporter_name: z.string(),
  reporter_phone: z.string().optional(),
  reporter_email: z.string().email().optional(),
});

export const importSchema = baseSchema.extend({
  source: z.literal('import'),
  import_batch_id: z.string(),
  original_source: z.string(),
});

// Union schema cho validation
export const scamReportSchema = z.union([
  checkscamSchema,
  extensionSchema,
  manualSchema,
  importSchema,
  baseSchema // fallback cho unknown sources
]);

// Types
export type ScamReport = z.infer<typeof scamReportSchema>;
export type BaseScamReport = z.infer<typeof baseSchema>;
export type CheckscamReport = z.infer<typeof checkscamSchema>;
export type ExtensionReport = z.infer<typeof extensionSchema>;
export type ManualReport = z.infer<typeof manualSchema>;
export type ImportReport = z.infer<typeof importSchema>;
