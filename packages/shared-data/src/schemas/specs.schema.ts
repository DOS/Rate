import { z } from 'zod';
import { StatusSchema } from './common.schema';

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
  weight_g: z.number().optional(),
  materials: z.string().optional(),
  build: z.string().optional(),
  resistance: z.string().optional(),
  biometrics: z.string().optional(),
  keys: z.string().optional(),
  colors: z.array(z.string()).optional(),
});

export const DisplaySchema = z.object({
  size_inch: z.number().optional(),
  type: z.string().optional(),
  resolution: z.string().optional(),
  refresh_rate_hz: z.number().optional(),
  ppi: z.number().optional(),
  protection: z.string().optional(),
  features: z.string().optional(),
});

export const HardwareSchema = z.object({
  chipset: z.string().optional(),
  cpu: z.string().optional(),
  gpu: z.string().optional(),
  ram_gb: z.number().optional(),
  storage_gb: z.number().optional(),
  storage_expansion: z.string().optional(),
  os: z.string().optional(),
});

export const BatterySchema = z.object({
  capacity_mah: z.number().optional(),
  type: z.string().optional(),
  charging: z.string().optional(),
  fast_charging_w: z.number().optional(),
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
  ram_gb: z.number().nullable().optional(),
  storage_gb: z.number().nullable().optional(),
  screen_size_inch: z.number().nullable().optional(),
  battery_mah: z.number().nullable().optional(),
  has_5g: z.boolean().default(false),
  specifications: ProductSpecificationsSchema.default({}),
  key_specs: KeySpecsSchema.default({}),
  images: z.array(z.string()).default([]),
  thumbnail: z.string().nullable().optional(),
  colors: z.array(z.string()).default([]),
  min_price: z.number().default(0),
  max_price: z.number().default(0),
  merchant_count: z.number().default(0),
  total_reviews: z.number().default(0),
  average_rating: z.number().default(0),
  status: StatusSchema.default('published'),
  metadata: z.record(z.any()).default({}),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
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
