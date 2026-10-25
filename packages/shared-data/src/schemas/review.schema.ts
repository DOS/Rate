import { z } from 'zod';
import { HttpUrlSchema, UUIDv7Schema, StatusSchema } from './common.schema.js';

/**
 * Review-related schemas
 */

export const ReviewTypeSchema = z.enum(['review', 'report', 'complaint']);

export const ReviewSchema = z.object({
  id: UUIDv7Schema,
  listingId: UUIDv7Schema,
  userId: UUIDv7Schema,
  type: ReviewTypeSchema,
  rating: z.number().min(1).max(5),
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(10).max(5000),
  pros: z.array(z.string().max(300)).max(20).optional(),
  cons: z.array(z.string().max(300)).max(20).optional(),
  images: z.array(HttpUrlSchema).max(50).optional(),
  isVerified: z.boolean().default(false),
  isAnonymous: z.boolean().default(false),
  status: StatusSchema,
  helpfulCount: z.number().int().nonnegative().default(0),
  unhelpfulCount: z.number().int().nonnegative().default(0),
  reportCount: z.number().int().nonnegative().default(0),
  reply: z
    .object({
      content: z.string().trim().min(1).max(5000),
      createdAt: z.string().datetime(),
      createdBy: UUIDv7Schema,
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateReviewSchema = ReviewSchema.omit({
  id: true,
  helpfulCount: true,
  unhelpfulCount: true,
  reportCount: true,
  reply: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateReviewSchema = ReviewSchema.partial().omit({
  id: true,
  listingId: true,
  userId: true,
  createdAt: true,
});

export const ReviewFilterSchema = z
  .object({
    listingId: UUIDv7Schema.optional(),
    userId: UUIDv7Schema.optional(),
    type: ReviewTypeSchema.optional(),
    status: StatusSchema.optional(),
    isVerified: z.boolean().optional(),
    isAnonymous: z.boolean().optional(),
    minRating: z.number().min(1).max(5).optional(),
    maxRating: z.number().min(1).max(5).optional(),
    hasReply: z.boolean().optional(),
  })
  .refine(
    (f) =>
      f.minRating === undefined ||
      f.maxRating === undefined ||
      f.minRating <= f.maxRating,
    { message: 'minRating must be less than or equal to maxRating' }
  );

export const ReviewReactionSchema = z.object({
  reviewId: UUIDv7Schema,
  userId: UUIDv7Schema,
  type: z.enum(['helpful', 'unhelpful', 'report']),
  reason: z.string().trim().min(1).max(1000).optional(), // For reports
});

export type Review = z.infer<typeof ReviewSchema>;
export type CreateReview = z.infer<typeof CreateReviewSchema>;
export type UpdateReview = z.infer<typeof UpdateReviewSchema>;
export type ReviewFilter = z.infer<typeof ReviewFilterSchema>;
export type ReviewReaction = z.infer<typeof ReviewReactionSchema>;
