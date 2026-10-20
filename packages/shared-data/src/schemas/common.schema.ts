import { z } from 'zod';

/**
 * Common schemas used across the application
 */

export const HttpUrlSchema = z
  .string()
  .url()
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'URL must use http:// or https:// protocol' }
  );

// Pagination
export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  pageCount: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
});

// API Response wrapper
export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: z
      .object({
        pagination: PaginationSchema.optional(),
        timestamp: z.string().datetime(),
        version: z.string().optional(),
      })
      .optional(),
    error: z
      .object({
        status: z.number(),
        name: z.string(),
        message: z.string(),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  });

// Common filters
export const DateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const SortSchema = z.object({
  field: z.string(),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// UUID v7 validation
export const UUIDv7Schema = z.string().uuid();

// Status enums
export const StatusSchema = z.enum(['draft', 'published', 'archived']);

// Language codes
export const LanguageSchema = z.enum(['vi', 'en', 'cs']);

export type Pagination = z.infer<typeof PaginationSchema>;
export type DateRange = z.infer<typeof DateRangeSchema>;
export type Sort = z.infer<typeof SortSchema>;
export type Status = z.infer<typeof StatusSchema>;
export type Language = z.infer<typeof LanguageSchema>;
