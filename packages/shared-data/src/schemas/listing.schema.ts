import { z } from 'zod';
import {
  HttpUrlSchema,
  UUIDv7Schema,
  StatusSchema,
  LanguageSchema,
} from './common.schema.js';

/**
 * Listing-related schemas
 */

export const ListingTypeSchema = z.enum([
  'product',
  'service',
  'company',
  'website',
]);

export const ListingCategorySchema = z.enum([
  'technology',
  'finance',
  'education',
  'healthcare',
  'ecommerce',
  'real_estate',
  'travel',
  'food',
  'entertainment',
  'other',
]);

export const ListingSchema = z.object({
  id: UUIDv7Schema,
  title: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((s) => s !== '.' && s !== '..' && !/[\p{Cc}\s/\\]/u.test(s), {
      message: 'Invalid listing slug',
    }),
  description: z.string().max(10_000).optional(),
  content: z.string().max(50_000).optional(),
  type: ListingTypeSchema,
  category: ListingCategorySchema,
  status: StatusSchema,
  locale: LanguageSchema,
  thumbnail: HttpUrlSchema.optional(),
  images: z.array(HttpUrlSchema).max(100).optional(),
  website: HttpUrlSchema.optional(),
  phoneNumber: z.string().max(40).optional(),
  email: z.string().max(254).email().optional(),
  address: z.string().max(500).optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().nonnegative().default(0),
  viewCount: z.number().int().nonnegative().default(0),
  isFeatured: z.boolean().default(false),
  isVerified: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string().max(64)).max(50).optional(),
  publishedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: UUIDv7Schema.optional(),
  updatedBy: UUIDv7Schema.optional(),
});

export const CreateListingSchema = ListingSchema.omit({
  id: true,
  slug: true,
  rating: true,
  reviewCount: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateListingSchema = ListingSchema.partial().omit({
  id: true,
  createdAt: true,
  createdBy: true,
});

export const ListingFilterSchema = z.object({
  type: ListingTypeSchema.optional(),
  category: ListingCategorySchema.optional(),
  status: StatusSchema.optional(),
  locale: LanguageSchema.optional(),
  isFeatured: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  search: z.string().max(200).optional(),
  minRating: z.number().min(0).max(5).optional(),
  tags: z.array(z.string().max(64)).max(50).optional(),
});

export type Listing = z.infer<typeof ListingSchema>;
export type CreateListing = z.infer<typeof CreateListingSchema>;
export type UpdateListing = z.infer<typeof UpdateListingSchema>;
export type ListingFilter = z.infer<typeof ListingFilterSchema>;
export type ListingType = z.infer<typeof ListingTypeSchema>;
export type ListingCategory = z.infer<typeof ListingCategorySchema>;
