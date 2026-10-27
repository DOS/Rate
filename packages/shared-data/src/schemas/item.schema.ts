import { z } from 'zod';
import { MAX_VALID_VND_PRICE } from '../rules/price-limits.js';
import {
  ITEM_KEY_PATTERN,
  MAX_MODEL_KEY_LENGTH,
  MODEL_KEY_PATTERN,
  VARIANT_KEY_PATTERN,
  splitModelKey,
} from '../rules/model-key.js';
import { HttpUrlSchema, StatusSchema } from './common.schema.js';
import {
  KeySpecsSchema,
  MasterProductSchema,
  ProductSpecificationsSchema,
} from './specs.schema.js';

/**
 * Item / variant / listing model (DOS/Rate#1149; design doc
 * `Docs/Proposals/2026-10-27-item-variant-listing-model.md`, section 4).
 * One Item per product (`rate.items`); each storage size is a variant
 * (`rate.master_products`); listings (`rate.products`) point at the Item and,
 * when the size is known, at the variant (`cluster_id`).
 */

/** Strict key shapes, for keys a writer builds. See `rules/model-key.ts`. */
export const ItemKeySchema = z
  .string()
  .max(MAX_MODEL_KEY_LENGTH)
  .regex(ITEM_KEY_PATTERN, { message: 'Invalid item_key' });
export const VariantKeySchema = z
  .string()
  .max(MAX_MODEL_KEY_LENGTH)
  .regex(VARIANT_KEY_PATTERN, { message: 'Invalid variant_key' });
export const ModelKeySchema = z
  .string()
  .max(MAX_MODEL_KEY_LENGTH)
  .regex(MODEL_KEY_PATTERN, { message: 'Invalid model_key' });

/** How a listing's variant was assigned (`products.variant_source`). */
export const VariantSourceSchema = z.enum([
  'title',
  'sku',
  'single_size',
  'single_variant',
  'manual',
  'legacy',
]);

/**
 * A `rate.items` row. `item_key` has no shape check here, as in the table:
 * legacy keys still get an Item (design doc 4.3).
 */
export const ItemSchema = z.object({
  id: z.string().uuid(),
  item_key: z.string().min(1).max(MAX_MODEL_KEY_LENGTH),
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  brand: z.string().min(1).max(120),
  model: z.string().min(1).max(200),
  category_id: z.string().uuid().nullable().optional(),
  status: StatusSchema.default('draft'),
  entity_type: z.enum(['product', 'service']).default('product'),
  description: z.string().max(50_000).nullable().optional(),
  specifications: ProductSpecificationsSchema.default({}),
  key_specs: KeySpecsSchema.default({}),
  spec_provenance: z.record(z.string(), z.unknown()).default({}),
  images: z.array(HttpUrlSchema).max(100).default([]),
  thumbnail: HttpUrlSchema.nullable().optional(),
  default_variant_id: z.string().uuid().nullable().optional(),
  min_price: z.number().nonnegative().max(MAX_VALID_VND_PRICE).default(0),
  max_price: z.number().nonnegative().max(MAX_VALID_VND_PRICE).default(0),
  price_variant_count: z.number().int().nonnegative().default(0),
  merchant_count: z.number().int().nonnegative().default(0),
  listing_count: z.number().int().nonnegative().default(0),
  unknown_variant_listing_count: z.number().int().nonnegative().default(0),
  total_reviews: z.number().int().nonnegative().default(0),
  average_rating: z.number().min(0).max(5).default(0),
  user_rating_weighted: z.number().min(0).max(5).nullable().optional(),
  authentic_review_count: z.number().int().nonnegative().default(0),
  expert_rating: z.number().min(0).max(5).nullable().optional(),
  expert_review_summary: z.string().max(10_000).nullable().optional(),
  expert_criteria_scores: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().max(64).optional(),
  updated_at: z.string().max(64).optional(),
});

/**
 * A variant: a `rate.master_products` row with its Item link. `item_id` and
 * `variant_key` stay nullable until the backfill and the M4 constraints.
 * When the `model_key` is well formed, `variant_key` must be its third
 * segment, so `model_key = item_key:variant_key` holds.
 */
export const VariantSchema = MasterProductSchema.extend({
  item_id: z.string().uuid().nullable().optional(),
  variant_key: z
    .string()
    .min(1)
    .max(MAX_MODEL_KEY_LENGTH)
    .nullable()
    .optional(),
  sort_order: z.number().int().min(-32768).max(32767).nullable().optional(),
}).superRefine((variant, ctx) => {
  if (variant.variant_key == null) return;
  const parts = splitModelKey(variant.model_key);
  if (parts && parts.variantKey !== variant.variant_key) {
    ctx.addIssue({
      code: 'custom',
      path: ['variant_key'],
      message: `variant_key must be the model_key's third segment (${parts.variantKey})`,
    });
  }
});

export type ItemKey = z.infer<typeof ItemKeySchema>;
export type VariantKey = z.infer<typeof VariantKeySchema>;
export type VariantSource = z.infer<typeof VariantSourceSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Variant = z.infer<typeof VariantSchema>;
