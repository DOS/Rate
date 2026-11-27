import { z } from 'zod';
import { MAX_VALID_VND_PRICE } from '../rules/price-limits.js';
import {
  CUSTOM_FIELD_KEY_RE,
  LONE_SURROGATE_RE,
  MAX_CUSTOM_FIELD_ABS_NUMBER,
  MAX_CUSTOM_FIELD_KEY_LENGTH,
  MAX_CUSTOM_FIELD_LIST_ITEM_LENGTH,
  MAX_CUSTOM_FIELD_LIST_ITEMS,
  MAX_CUSTOM_FIELD_STRING_LENGTH,
  MAX_CUSTOM_FIELDS,
} from '../rules/custom-fields.js';
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

const hasNoLoneSurrogates = (value: string): boolean => {
  LONE_SURROGATE_RE.lastIndex = 0;
  return !LONE_SURROGATE_RE.test(value);
};

export const CustomFieldValueSchema = z.union([
  z
    .string()
    .min(1)
    .max(MAX_CUSTOM_FIELD_STRING_LENGTH)
    .refine((value) => value.trim().length > 0 && hasNoLoneSurrogates(value)),
  z.number().min(-MAX_CUSTOM_FIELD_ABS_NUMBER).max(MAX_CUSTOM_FIELD_ABS_NUMBER),
  z.boolean(),
  z
    .array(
      z
        .string()
        .min(1)
        .max(MAX_CUSTOM_FIELD_LIST_ITEM_LENGTH)
        .refine(
          (value) => value.trim().length > 0 && hasNoLoneSurrogates(value)
        )
    )
    .min(1)
    .max(MAX_CUSTOM_FIELD_LIST_ITEMS),
]);

/**
 * Per-category facts outside the 10 spec groups (DOS/Rate#1923), such as an air
 * conditioner's `capacity_btu` or a supplement's `dosage_form`. Writers run
 * `sanitizeCustomFields` from `@repo/shared-data/rules` first, which coerces keys to
 * snake_case and enforces these bounds.
 */
export const CustomFieldsSchema = z
  .record(
    z
      .string()
      .max(MAX_CUSTOM_FIELD_KEY_LENGTH)
      .regex(CUSTOM_FIELD_KEY_RE)
      .refine((key) => key !== 'constructor' && key !== 'prototype'),
    CustomFieldValueSchema
  )
  .refine((fields) => Object.keys(fields).length <= MAX_CUSTOM_FIELDS, {
    message: `custom_fields holds at most ${MAX_CUSTOM_FIELDS} entries`,
  });

export const ProductSpecificationsSchema = z
  .object({
    category_slug: z.string().max(64).optional(),
    custom_fields: CustomFieldsSchema.optional(),
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
  })
  .passthrough();

export const KeySpecsSchema = z
  .object({
    screen: z.string().max(200).optional(),
    chip: z.string().max(200).optional(),
    camera: z.string().max(200).optional(),
    battery: z.string().max(200).optional(),
    storage: z.string().max(200).optional(),
    ram: z.string().max(200).optional(),
  })
  .passthrough();

// Defined with the price rules so `@repo/shared-data/rules` stays free of zod.
export { MAX_VALID_VND_PRICE };

export const EntityTypeSchema = z.enum(['product', 'service', 'place']);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const PlacePriceTierSchema = z.enum(['$', '$$', '$$$', '$$$$']);
export type PlacePriceTier = z.infer<typeof PlacePriceTierSchema>;

export const PlacePriceUnitSchema = z.enum([
  'vnd_per_person',
  'vnd_per_night_ref',
]);
export type PlacePriceUnit = z.infer<typeof PlacePriceUnitSchema>;

const PLACE_KEY_RE = /^[a-z0-9_-]{1,128}:[a-z0-9_-]{1,80}:[a-z0-9_-]{1,128}$/;
const BRANCH_GROUP_KEY_RE = /^[a-z0-9_-]{1,128}$/;
const GEOHASH7_RE = /^[0-9bcdefghjkmnpqrstuvwxyz]{7}$/;
const ADMIN_CODE_RE = /^[a-z0-9_-]{1,64}$/;

/**
 * Runtime Zod contract matching `rate.place_details` 1:1 (Wave E4 PA2).
 */
export const PlaceDetailSchema = z
  .object({
    masterId: z.string().uuid(),
    placeKey: z.string().regex(PLACE_KEY_RE, {
      message:
        'placeKey must match ^[a-z0-9_-]{1,128}:[a-z0-9_-]{1,80}:[a-z0-9_-]{1,128}$',
    }),
    branchGroupKey: z.string().regex(BRANCH_GROUP_KEY_RE, {
      message: 'branchGroupKey must match ^[a-z0-9_-]{1,128}$',
    }),
    geoLat: z.number().finite().min(-90).max(90).nullable().optional(),
    geoLng: z.number().finite().min(-180).max(180).nullable().optional(),
    geohash7: z
      .string()
      .regex(GEOHASH7_RE, {
        message: 'geohash7 must be 7 lowercase base32 characters',
      })
      .nullable()
      .optional(),
    address: z.string().max(500).nullable().optional(),
    provinceCode: z.string().regex(ADMIN_CODE_RE, {
      message: 'provinceCode must match ^[a-z0-9_-]{1,64}$',
    }),
    districtCode: z
      .string()
      .regex(ADMIN_CODE_RE, {
        message: 'districtCode must match ^[a-z0-9_-]{1,64}$',
      })
      .nullable()
      .optional(),
    priceMin: z
      .number()
      .int()
      .positive()
      .max(MAX_VALID_VND_PRICE)
      .nullable()
      .optional(),
    priceMax: z
      .number()
      .int()
      .positive()
      .max(MAX_VALID_VND_PRICE)
      .nullable()
      .optional(),
    priceTier: PlacePriceTierSchema.nullable().optional(),
    priceUnit: PlacePriceUnitSchema.nullable().optional(),
    openingHours: z.string().max(500).nullable().optional(),
    phone: z.string().max(64).nullable().optional(),
    website: HttpUrlSchema.nullable().optional(),
    cuisine: z.string().max(200).nullable().optional(),
    starRating: z
      .number()
      .finite()
      .min(1)
      .max(5)
      .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, {
        message: 'starRating must be in 0.1 steps between 1.0 and 5.0',
      })
      .nullable()
      .optional(),
    sourceIds: z.record(z.string(), z.unknown()).default({}),
    overtureConfidence: z.number().finite().min(0).max(1).nullable().optional(),
  })
  .superRefine((detail, ctx) => {
    const hasLat = detail.geoLat !== null && detail.geoLat !== undefined;
    const hasLng = detail.geoLng !== null && detail.geoLng !== undefined;
    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: 'custom',
        path: [hasLat ? 'geoLng' : 'geoLat'],
        message: 'geoLat and geoLng must both be provided or both omitted/null',
      });
    }
    if (
      detail.priceMin !== null &&
      detail.priceMin !== undefined &&
      detail.priceMax !== null &&
      detail.priceMax !== undefined &&
      detail.priceMax < detail.priceMin
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['priceMax'],
        message: 'priceMax must be greater than or equal to priceMin',
      });
    }
  });

export type PlaceDetail = z.infer<typeof PlaceDetailSchema>;

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
  // null = not known (DOS/Rate#1196); an omitted value defaults like the column.
  has_5g: z.boolean().nullable().default(false),
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
  entity_type: EntityTypeSchema.default('product').optional(),
  expert_rating: z.number().min(0).max(5).nullable().optional(),
  expert_review_summary: z.string().max(10_000).nullable().optional(),
  expert_criteria_scores: z
    .record(z.string(), z.unknown())
    .default({})
    .optional(),
  user_rating_weighted: z.number().min(0).max(5).nullable().optional(),
  // The one rating (DOS/Rate#1545, design #1531 D3): Bayesian, k = 3,
  // mu = 4.2, stored at 3 decimals; null while no review counts.
  rating_score: z.number().min(0).max(5).nullable().optional(),
  rating_weight_sum: z.number().nonnegative().optional(),
  // Per criterion, only past D9's display threshold:
  // { key: { score, weight_sum, writers } }.
  criteria_scores: z.record(z.string(), z.unknown()).default({}).optional(),
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
  'dienmayxanh',
  'topzone',
  'gearvn',
  'nguyenkim',
  'shopdunk',
  'hacom',
  'clickbuy',
  'viettelstore',
  'pico',
  'mediamart',
  'memoryzone',
  'anphatpc',
]);

export type SupportedEcommercePlatform = z.infer<
  typeof SupportedEcommercePlatformSchema
>;

export const SUPPORTED_SERVICE_PLATFORMS = [
  'vietcombank',
  'acb',
  'vnpt',
  'fpttelecom',
  'vpbank',
  'vib',
  'techcombank',
  'sacombank',
  'tpbank',
  'hsbc',
  'shinhan',
] as const;

export const SupportedServicePlatformSchema = z.enum(
  SUPPORTED_SERVICE_PLATFORMS
);

export type SupportedServicePlatform = z.infer<
  typeof SupportedServicePlatformSchema
>;

/**
 * Retail chains ingested from first-party catalogs only. They are not extension
 * platforms: `SupportedEcommercePlatformSchema` stays at the 22 the extension supports.
 */
export const SUPPORTED_RETAIL_INGESTION_PLATFORMS = [
  'avakids',
  'pharmacity',
  'kidsplaza',
  'concung',
] as const;

export const SupportedIngestionPlatformSchema = z.enum([
  ...SupportedEcommercePlatformSchema.options,
  ...SUPPORTED_SERVICE_PLATFORMS,
  ...SUPPORTED_RETAIL_INGESTION_PLATFORMS,
]);

export type SupportedIngestionPlatform = z.infer<
  typeof SupportedIngestionPlatformSchema
>;

export const SupportedPriceCurrencySchema = z.enum(['VND', 'PCT']);

export type SupportedPriceCurrency = z.infer<
  typeof SupportedPriceCurrencySchema
>;

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
  /** Keyed HMAC of the original author name, computed by Rate-Services; not reversible. */
  authorKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,128}$/)
    .optional()
    // A malformed key is dropped, never a reason to reject the listing: analysis uses author_name.
    .catch(undefined),
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
  platform: SupportedIngestionPlatformSchema.optional(),
  itemId: z.string().min(1).max(128),
  shopId: z.string().min(1).max(128),
  url: HttpUrlSchema,
  title: z.string().min(1).max(1000),
  brand: z.string().max(120).optional(),
  description: z.string().max(50_000).optional(),
  entity_type: EntityTypeSchema.optional(),
  category_slug: z.string().max(64).optional(),
  priceMin: z.number().nonnegative().max(MAX_VALID_VND_PRICE),
  priceMax: z.number().nonnegative().max(MAX_VALID_VND_PRICE),
  priceBeforeDiscount: z
    .number()
    .nonnegative()
    .transform((v) => (v > MAX_VALID_VND_PRICE ? undefined : v))
    .optional(),
  currency: SupportedPriceCurrencySchema.default('VND'),
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
  metadata: z.record(z.string(), z.unknown()).optional(),
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
