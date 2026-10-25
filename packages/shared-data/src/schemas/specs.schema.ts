import { z } from 'zod';
import { MAX_VALID_VND_PRICE } from '../rules/price-limits.js';
import { HttpUrlSchema, StatusSchema } from './common.schema.js';

/**
 * 10 Field Groups Specifications for Devices (PhoneArena + GSMArena unified schema)
 * Supports Phones, Tablets, Laptops, Wearables
 */

export const AvailabilitySchema = z.object({
  announced: z.string().max(500).optional(),
  status: z.string().max(500).optional(),
  prices_msrp: z.string().max(500).optional(),
});

export const DesignSchema = z.object({
  dimensions: z.string().max(500).optional(),
  weight_g: z.number().positive().max(25000).optional(),
  materials: z.string().max(500).optional(),
  build: z.string().max(500).optional(),
  resistance: z.string().max(500).optional(),
  biometrics: z.string().max(500).optional(),
  keys: z.string().max(500).optional(),
  colors: z.array(z.string().max(80)).max(50).optional(),
});

export const DisplaySchema = z.object({
  size_inch: z.number().positive().max(120).optional(),
  type: z.string().max(500).optional(),
  resolution: z.string().max(500).optional(),
  refresh_rate_hz: z.number().positive().max(1000).optional(),
  ppi: z.number().positive().max(5000).optional(),
  protection: z.string().max(500).optional(),
  features: z.string().max(500).optional(),
});

export const HardwareSchema = z.object({
  chipset: z.string().max(500).optional(),
  cpu: z.string().max(500).optional(),
  gpu: z.string().max(500).optional(),
  ram_gb: z.number().positive().max(2048).optional(),
  storage_gb: z.number().positive().max(65536).optional(),
  storage_expansion: z.string().max(500).optional(),
  os: z.string().max(500).optional(),
});

export const BatterySchema = z.object({
  capacity_mah: z.number().positive().max(500000).optional(),
  type: z.string().max(500).optional(),
  charging: z.string().max(500).optional(),
  fast_charging_w: z.number().nonnegative().max(1000).optional(),
  reverse_charging: z.union([z.boolean(), z.string().max(500)]).optional(),
});

export const CameraSchema = z.object({
  rear_setup: z.string().max(500).optional(),
  main_camera: z.string().max(500).optional(),
  second_camera: z.string().max(500).optional(),
  third_camera: z.string().max(500).optional(),
  fourth_camera: z.string().max(500).optional(),
  flash: z.string().max(500).optional(),
  video_recording: z.string().max(500).optional(),
  front_camera: z.string().max(500).optional(),
});

export const ConnectivitySchema = z.object({
  bluetooth: z.string().max(500).optional(),
  wlan: z.string().max(500).optional(),
  usb: z.string().max(500).optional(),
  sensors: z.string().max(500).optional(),
  location: z.string().max(500).optional(),
  nfc: z.boolean().optional(),
  other: z.string().max(500).optional(),
});

export const CellularSchema = z.object({
  has_5g: z.boolean().optional(),
  bands_5g: z.string().max(500).optional(),
  bands_4g: z.string().max(500).optional(),
  bands_3g: z.string().max(500).optional(),
  bands_2g: z.string().max(500).optional(),
  technology: z.string().max(500).optional(),
  data_speed: z.string().max(500).optional(),
  sim_type: z.string().max(500).optional(),
  volte: z.boolean().optional(),
  vowifi: z.boolean().optional(),
});

export const MultimediaSchema = z.object({
  loudspeaker: z.string().max(500).optional(),
  headphone_jack_35mm: z.boolean().optional(),
  audio_features: z.string().max(500).optional(),
});

export const RegulatorySchema = z.object({
  fcc_approval: z.string().max(500).optional(),
  sar_head: z.string().max(500).optional(),
  sar_body: z.string().max(500).optional(),
  sar_simultaneous: z.string().max(500).optional(),
  certifications: z.string().max(500).optional(),
});

export const ProductSpecificationsSchema = z.object({
  category_slug: z.string().max(64).optional(),
  availability: AvailabilitySchema.optional(),
  design: DesignSchema.optional(),
  display: DisplaySchema.optional(),
  hardware: HardwareSchema.optional(),
  battery: BatterySchema.optional(),
  camera: CameraSchema.optional(),
  connectivity: ConnectivitySchema.optional(),
  cellular: CellularSchema.optional(),
  multimedia: MultimediaSchema.optional(),
  regulatory: RegulatorySchema.optional(),
});

export const KeySpecsSchema = z.object({
  screen: z.string().max(200).optional(),
  chip: z.string().max(200).optional(),
  camera: z.string().max(200).optional(),
  battery: z.string().max(200).optional(),
  storage: z.string().max(200).optional(),
  ram: z.string().max(200).optional(),
});

// Defined with the price rules so `@repo/shared-data/rules` stays free of zod.
export { MAX_VALID_VND_PRICE };

export const MasterProductSchema = z.object({
  id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  brand: z.string().min(1).max(120),
  model: z.string().min(1).max(200),
  variant_name: z.string().max(200).nullable().optional(),
  model_key: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  slug: z.string().min(1).max(200),
  description: z.string().max(50_000).nullable().optional(),
  ram_gb: z.number().positive().max(2048).nullable().optional(),
  storage_gb: z.number().positive().max(65536).nullable().optional(),
  screen_size_inch: z.number().positive().max(120).nullable().optional(),
  battery_mah: z.number().positive().max(500000).nullable().optional(),
  has_5g: z.boolean().default(false),
  specifications: ProductSpecificationsSchema.default({}),
  key_specs: KeySpecsSchema.default({}),
  images: z.array(HttpUrlSchema).max(100).default([]),
  thumbnail: HttpUrlSchema.nullable().optional(),
  colors: z.array(z.string().max(80)).max(50).default([]),
  min_price: z.number().nonnegative().max(MAX_VALID_VND_PRICE).default(0),
  max_price: z.number().nonnegative().max(MAX_VALID_VND_PRICE).default(0),
  merchant_count: z.number().int().nonnegative().default(0),
  total_reviews: z.number().int().nonnegative().default(0),
  average_rating: z.number().min(0).max(5).nullable().default(null),
  entity_type: z.enum(['product', 'service']).default('product').optional(),
  expert_rating: z.number().min(0).max(5).nullable().optional(),
  expert_review_summary: z.string().max(10_000).nullable().optional(),
  expert_criteria_scores: z
    .record(z.string(), z.unknown())
    .default({})
    .optional(),
  user_rating_weighted: z.number().min(0).max(5).nullable().optional(),
  authentic_review_count: z.number().int().nonnegative().default(0).optional(),
  status: StatusSchema.default('draft'),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().max(64).optional(),
  updated_at: z.string().max(64).optional(),
});

/**
 * Runtime Zod Contract for Scraper -> Open-Core Engine Ingestion (Audit T15)
 */
export const SupportedEcommercePlatformSchema = z.enum([
  'shopee',
  'lazada',
  'tiki',
  'tiktok',
  'cellphones',
  'tgdd',
  'fptshop',
  'hoangha',
  'didongviet',
  'phongvu',
]);

export const ScrapedReviewerSchema = z.object({
  key: z.string().max(128).optional(),
  isAnonymous: z.boolean().optional(),
  profileUrl: HttpUrlSchema.optional(),
  joinedAt: z.string().max(64).optional(),
  totalReviews: z.number().int().nonnegative().optional(),
  helpfulVotes: z.number().int().nonnegative().optional(),
  verifiedPurchase: z.boolean().optional(),
  purchasedAt: z.string().max(64).optional(),
  repeatPurchase: z.boolean().optional(),
});

export const ScrapedReviewSchema = z.object({
  reviewId: z.string().max(128),
  author: z.string().max(200),
  authorAvatar: HttpUrlSchema.optional(),
  ratingStar: z.number().min(1).max(5),
  comment: z.string().max(10_000),
  variation: z.string().max(250).optional(),
  createdAt: z.string().max(64).optional(),
  images: z.array(HttpUrlSchema).max(50).default([]),
  videos: z.array(HttpUrlSchema).max(20).optional(),
  sellerReply: z.string().max(5000).optional(),
  likeCount: z.number().int().nonnegative().optional(),
  reviewer: ScrapedReviewerSchema.optional(),
});

export const ScrapedProductSchema = z.object({
  platform: SupportedEcommercePlatformSchema.optional(),
  itemId: z.string().min(1).max(128),
  shopId: z.string().min(1).max(128),
  url: HttpUrlSchema,
  title: z.string().min(1).max(1000),
  description: z.string().max(50_000).optional(),
  priceMin: z.number().nonnegative().max(MAX_VALID_VND_PRICE),
  priceMax: z.number().nonnegative().max(MAX_VALID_VND_PRICE),
  priceBeforeDiscount: z
    .number()
    .nonnegative()
    .transform((v) => (v > MAX_VALID_VND_PRICE ? undefined : v))
    .optional(),
  currency: z.string().min(1).max(16).default('VND'),
  historicalSold: z.number().int().nonnegative().default(0),
  /** Marketplace sold label (e.g. "20k+") when historicalSold is only its floor. */
  // Cosmetic: a malformed label is dropped, never a reason to reject the listing.
  historicalSoldDisplay: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .optional()
    .catch(undefined),
  stock: z.number().int().nonnegative().optional(),
  ratingStar: z.number().min(0).max(5).default(0),
  ratingCount: z.number().int().nonnegative().default(0),
  ratingScoreDistribution: z
    .array(z.number().int().nonnegative())
    .max(10)
    .optional(),
  images: z.array(HttpUrlSchema).max(100).default([]),
  models: z
    .array(
      z.object({
        modelId: z.string().max(128),
        name: z.string().max(300),
        price: z.number().nonnegative(),
        stock: z.number().int().nonnegative().optional(),
        sku: z.string().max(200).optional(),
      })
    )
    .max(200)
    .default([])
    .transform((models) =>
      models.filter((m) => m.price <= MAX_VALID_VND_PRICE)
    ),
  attributes: z
    .array(
      z.object({
        name: z.string().max(200),
        value: z.string().max(1000),
      })
    )
    .max(200)
    .default([]),
  shop: z.object({
    shopId: z.string().min(1).max(128),
    name: z.string().min(1).max(250),
    isMall: z.boolean(),
    ratingStar: z.number().min(0).max(5).optional(),
    followerCount: z.number().int().nonnegative().optional(),
    location: z.string().max(200).optional(),
    url: HttpUrlSchema.optional(),
  }),
  reviews: z.array(ScrapedReviewSchema).max(500).default([]),
  pricesOnly: z.boolean().optional(),
});

export type Availability = z.infer<typeof AvailabilitySchema>;
export type Design = z.infer<typeof DesignSchema>;
export type Display = z.infer<typeof DisplaySchema>;
export type Hardware = z.infer<typeof HardwareSchema>;
export type Battery = z.infer<typeof BatterySchema>;
export type Camera = z.infer<typeof CameraSchema>;
export type Connectivity = z.infer<typeof ConnectivitySchema>;
export type Cellular = z.infer<typeof CellularSchema>;
export type Multimedia = z.infer<typeof MultimediaSchema>;
export type Regulatory = z.infer<typeof RegulatorySchema>;
export type ProductSpecifications = z.infer<typeof ProductSpecificationsSchema>;
export type KeySpecs = z.infer<typeof KeySpecsSchema>;
export type MasterProduct = z.infer<typeof MasterProductSchema>;
export type ValidatedScrapedProduct = z.infer<typeof ScrapedProductSchema>;
