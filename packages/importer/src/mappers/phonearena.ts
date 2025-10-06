/**
 * PhoneArena mapper - Transform raw PhoneArena data to Strapi Item format
 */

import type { PhoneArenaRawData, MappedItem } from '../types';

/**
 * Extract phone name từ URL
 * https://www.phonearena.com/phones/Xiaomi-17_id12857 -> Xiaomi 17
 */
function extractPhoneName(url: string): string {
  const match = url.match(/\/phones\/([^_]+)_id\d+$/);
  if (!match) return '';
  return match[1].replace(/-/g, ' ');
}

/**
 * Extract PhoneArena ID từ URL
 * https://www.phonearena.com/phones/Xiaomi-17_id12857 -> 12857
 */
function extractPhoneArenaId(url: string): string {
  const match = url.match(/_id(\d+)$/);
  return match ? match[1] : '';
}

/**
 * Parse announced date
 * "Oct 25, 2025" -> ISO string
 */
function parseAnnouncedDate(dateStr: string): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    return date.toISOString();
  } catch {
    return null;
  }
}

/**
 * Map PhoneArena raw data to Strapi Item structure
 */
export function mapPhoneArenaToItem(data: PhoneArenaRawData): MappedItem {
  const availability = data.specs['Availability'] || {};
  const design = data.specs['Design'] || {};
  const display = data.specs['Display'] || {};
  const hardware = data.specs['Hardware'] || {};
  const battery = data.specs['Battery'] || {};
  const camera = data.specs['Camera'] || {};

  // Extract basic info
  const name = extractPhoneName(data.url);
  const phoneArenaId = extractPhoneArenaId(data.url);
  const announcedDate = parseAnnouncedDate(availability['Officially announced']);

  return {
    // Basic fields
    Title: name,
    ItemType: 'Product',
    Brand: name.split(' ')[0], // Extract brand (e.g., "Xiaomi 17" -> "Xiaomi")

    // Platform identifiers
    PlatformIdentifiers: {
      phonearena: phoneArenaId,
      source: 'PhoneArena',
      sourceUrl: data.url,
    },

    // Availability
    AnnouncedDate: announcedDate,
    AvailabilityStatus: 'Available',

    // Specs - lưu vào DynamicFields
    DynamicFields: {
      // Design
      Dimensions: design['Dimensions'] || null,
      Weight: design['Weight'] || null,
      Materials: design['Materials'] || null,
      Colors: design['Colors'] || null,
      WaterResistance: design['Resistance'] || null,
      Biometrics: design['Biometrics'] || null,

      // Display
      DisplaySize: display['Size'] || null,
      DisplayType: display['Type'] || null,
      DisplayResolution: display['Resolution'] || null,
      DisplayProtection: display['Protection'] || null,

      // Hardware
      Chipset: hardware['System chip'] || null,
      CPU: hardware['Processor'] || null,
      GPU: hardware['GPU'] || null,
      Memory: hardware['Memory'] || null,
      StorageExpansion: hardware['Storage expansion'] || null,
      OS: hardware['OS'] || null,

      // Battery
      BatteryCapacity: battery['Type'] || null,
      ChargingSpeed: battery['Charge speed'] || null,
      ChargingTechnology: battery['Charging'] || null,

      // Camera
      RearCamera: camera['Rear'] || null,
      MainCamera: camera['Main camera'] || null,
      SecondCamera: camera['Second camera'] || null,
      ThirdCamera: camera['Third camera'] || null,
      FrontCamera: camera['Front'] || null,
      VideoRecording: camera['Video recording'] || null,
    },

  };
}
