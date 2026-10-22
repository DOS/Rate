import { z } from 'zod';
import { HttpUrlSchema, StatusSchema } from './common.schema.js';

/**
 * 10 Field Groups Specifications for Devices (PhoneArena + GSMArena unified schema)
 * Supports Phones, Tablets, Laptops, Wearables
 */

export const AvailabilitySchema = z.object({
  announced: z.string().optional(),
  status: z.string().optional(),
  prices_msrp: z.string().optional(),
});

export const DesignSchema = z.object({
  dimensions: z.string().optional(),
  weight_g: z.number().positive().max(25000).optional(),
  materials: z.string().optional(),
  build: z.string().optional(),
  resistance: z.string().optional(),
  biometrics: z.string().optional(),
  keys: z.string().optional(),
  colors: z.array(z.string()).optional(),
});

export const DisplaySchema = z.object({
  size_inch: z.number().positive().max(120).optional(),
  type: z.string().optional(),
  resolution: z.string().optional(),
  refresh_rate_hz: z.number().positive().max(1000).optional(),
  ppi: z.number().positive().max(5000).optional(),
  protection: z.string().optional(),
  features: z.string().optional(),
});

export const HardwareSchema = z.object({
  chipset: z.string().optional(),
  cpu: z.string().optional(),
  gpu: z.string().optional(),
  ram_gb: z.number().positive().max(2048).optional(),
  storage_gb: z.number().positive().max(65536).optional(),
  storage_expansion: z.string().optional(),
  os: z.string().optional(),
});

export const BatterySchema = z.object({
  capacity_mah: z.number().positive().max(500000).optional(),
  type: z.string().optional(),
  charging: z.string().optional(),
  fast_charging_w: z.number().nonnegative().max(1000).optional(),
  reverse_charging: z.union([z.boolean(), z.string()]).optional(),
});

export const CameraSchema = z.object({
  rear_setup: z.string().optional(),
  main_camera: z.string().optional(),
  second_camera: z.string().optional(),
  third_camera: z.string().optional(),
  fourth_camera: z.string().optional(),
  flash: z.string().optional(),
  video_recording: z.string().optional(),
  front_camera: z.string().optional(),
});

export const ConnectivitySchema = z.object({
  bluetooth: z.string().optional(),
  wlan: z.string().optional(),
  usb: z.string().optional(),
  sensors: z.string().optional(),
  location: z.string().optional(),
  nfc: z.boolean().optional(),
  other: z.string().optional(),
});

export const CellularSchema = z.object({
  has_5g: z.boolean().optional(),
  bands_5g: z.string().optional(),
  bands_4g: z.string().optional(),
  bands_3g: z.string().optional(),
  bands_2g: z.string().optional(),
  technology: z.string().optional(),
  data_speed: z.string().optional(),
  sim_type: z.string().optional(),
  volte: z.boolean().optional(),
  vowifi: z.boolean().optional(),
});

export const MultimediaSchema = z.object({
  loudspeaker: z.string().optional(),
  headphone_jack_35mm: z.boolean().optional(),
  audio_features: z.string().optional(),
});

export const RegulatorySchema = z.object({
  fcc_approval: z.string().optional(),
  sar_head: z.string().optional(),
  sar_body: z.string().optional(),
  sar_simultaneous: z.string().optional(),
  certifications: z.string().optional(),
});

export const ProductSpecificationsSchema = z.object({
  category_slug: z.string().optional(),
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
  screen: z.string().optional(),
  chip: z.string().optional(),
  camera: z.string().optional(),
  battery: z.string().optional(),
  storage: z.string().optional(),
  ram: z.string().optional(),
});

/** Maximum realistic VND listing price (1 billion VND) to block unscaled fixed-point / concatenated price bugs. */
export const MAX_VALID_VND_PRICE = 1_000_000_000;

export const MasterProductSchema = z.object({
  id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  brand: z.string().min(1),
  model: z.string().min(1),
  variant_name: z.string().nullable().optional(),
  model_key: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable().optional(),
  ram_gb: z.number().positive().max(2048).nullable().optional(),
  storage_gb: z.number().positive().max(65536).nullable().optional(),
  screen_size_inch: z.number().positive().max(120).nullable().optional(),
  battery_mah: z.number().positive().max(500000).nullable().optional(),
  has_5g: z.boolean().default(false),
  specifications: ProductSpecificationsSchema.default({}),
  key_specs: KeySpecsSchema.default({}),
  images: z.array(HttpUrlSchema).default([]),
  thumbnail: HttpUrlSchema.nullable().optional(),
  colors: z.array(z.string()).default([]),
  min_price: z.number().nonnegative().max(MAX_VALID_VND_PRICE).default(0),
  max_price: z.number().nonnegative().max(MAX_VALID_VND_PRICE).default(0),
  merchant_count: z.number().int().nonnegative().default(0),
  total_reviews: z.number().int().nonnegative().default(0),
  average_rating: z.number().min(0).max(5).nullable().default(null),
  entity_type: z.enum(['product', 'service']).default('product').optional(),
  expert_rating: z.number().min(0).max(5).nullable().optional(),
  expert_review_summary: z.string().nullable().optional(),
  expert_criteria_scores: z
    .record(z.string(), z.unknown())
    .default({})
    .optional(),
  user_rating_weighted: z.number().min(0).max(5).nullable().optional(),
  authentic_review_count: z.number().int().nonnegative().default(0).optional(),
  status: StatusSchema.default('draft'),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
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
  key: z.string().optional(),
  isAnonymous: z.boolean().optional(),
  profileUrl: z.string().optional(),
  joinedAt: z.string().optional(),
  totalReviews: z.number().int().nonnegative().optional(),
  helpfulVotes: z.number().int().nonnegative().optional(),
  verifiedPurchase: z.boolean().optional(),
  purchasedAt: z.string().optional(),
  repeatPurchase: z.boolean().optional(),
});

export const ScrapedReviewSchema = z.object({
  reviewId: z.string(),
  author: z.string(),
  authorAvatar: z.string().optional(),
  ratingStar: z.number().min(1).max(5),
  comment: z.string(),
  variation: z.string().optional(),
  createdAt: z.string().optional(),
  images: z.array(z.string()).default([]),
  videos: z.array(z.string()).optional(),
  sellerReply: z.string().optional(),
  likeCount: z.number().int().nonnegative().optional(),
  reviewer: ScrapedReviewerSchema.optional(),
});

export const ScrapedProductSchema = z.object({
  platform: SupportedEcommercePlatformSchema.optional(),
  itemId: z.string().min(1),
  shopId: z.string().min(1),
  url: HttpUrlSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  priceMin: z.number().nonnegative().max(MAX_VALID_VND_PRICE),
  priceMax: z.number().nonnegative().max(MAX_VALID_VND_PRICE),
  priceBeforeDiscount: z.number().nonnegative().optional(),
  currency: z.string().min(1).default('VND'),
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
  ratingScoreDistribution: z.array(z.number().int().nonnegative()).optional(),
  images: z.array(z.string()).default([]),
  models: z
    .array(
      z.object({
        modelId: z.string(),
        name: z.string(),
        price: z.number().nonnegative(),
        stock: z.number().int().nonnegative().optional(),
        sku: z.string().optional(),
      })
    )
    .default([]),
  attributes: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
      })
    )
    .default([]),
  shop: z.object({
    shopId: z.string().min(1),
    name: z.string().min(1),
    isMall: z.boolean(),
    ratingStar: z.number().min(0).max(5).optional(),
    followerCount: z.number().int().nonnegative().optional(),
    location: z.string().optional(),
    url: z.string().optional(),
  }),
  reviews: z.array(ScrapedReviewSchema).default([]),
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
