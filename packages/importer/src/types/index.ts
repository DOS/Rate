/**
 * Shared types for data importers
 */

// Raw data from PhoneArena
export interface PhoneArenaRawData {
  url: string;
  specs: Record<string, Record<string, string>>;
}

// Mapped Item for Strapi
export interface MappedItem {
  Title: string;
  ItemType: string;
  Brand: string;
  PlatformIdentifiers: {
    phonearena?: string;
    gsmarena?: string;
    source: string;
    sourceUrl: string;
  };
  AnnouncedDate: string | null;
  AvailabilityStatus: string;
  DynamicFields: Record<string, any>;
}

// Mapped Listing for Strapi
export interface MappedListing {
  Title: string;
  Description?: string;
  Price?: number;
  Currency?: string;
  PlatformIdentifiers: {
    shopee?: string;
    tiki?: string;
    lazada?: string;
    source: string;
    sourceUrl: string;
  };
  // ... more fields
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Strapi API config
export interface StrapiConfig {
  apiUrl: string;
  apiToken: string;
}
