import { z } from 'zod';
import { UUIDv7Schema, StatusSchema, LanguageSchema } from './common.schema';

/**
 * Listing-related schemas
 */

export const ListingTypeSchema = z.enum(['product', 'service', 'company', 'website']);

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
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  description: z.string().optional(),
  content: z.string().optional(),
  type: ListingTypeSchema,
  category: ListingCategorySchema,
  status: StatusSchema,
  locale: LanguageSchema,
  thumbnail: z.string().url().optional(),
  images: z.array(z.string().url()).optional(),
  website: z.string().url().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().min(0).default(0),
  viewCount: z.number().min(0).default(0),
  isFeatured: z.boolean().default(false),
  isVerified: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
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
  search: z.string().optional(),
  minRating: z.number().min(0).max(5).optional(),
  tags: z.array(z.string()).optional(),
});

export type Listing = z.infer<typeof ListingSchema>;
export type CreateListing = z.infer<typeof CreateListingSchema>;
export type UpdateListing = z.infer<typeof UpdateListingSchema>;
export type ListingFilter = z.infer<typeof ListingFilterSchema>;
export type ListingType = z.infer<typeof ListingTypeSchema>;
export type ListingCategory = z.infer<typeof ListingCategorySchema>;