/**
 * Item validator - Validate mapped item data
 */

import type { MappedItem, ValidationResult } from '../types';

/**
 * Validate single Item
 */
export function validateItem(item: MappedItem): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // CRITICAL: Required fields
  if (!item.Title || item.Title.trim() === '') {
    errors.push('Title is required');
  }

  if (!item.PlatformIdentifiers || Object.keys(item.PlatformIdentifiers).length === 0) {
    errors.push('PlatformIdentifiers is required');
  }

  if (
    !item.PlatformIdentifiers?.sourceUrl ||
    !item.PlatformIdentifiers?.sourceUrl.startsWith('http')
  ) {
    errors.push('PlatformIdentifiers.sourceUrl must be valid URL');
  }

  // IMPORTANT: Data completeness warnings
  if (!item.AnnouncedDate) {
    warnings.push(`${item.Title}: Missing AnnouncedDate`);
  }

  if (!item.DynamicFields || Object.keys(item.DynamicFields).length === 0) {
    warnings.push(`${item.Title}: DynamicFields is empty`);
  }

  if (!item.DynamicFields?.Chipset) {
    warnings.push(`${item.Title}: Missing Chipset`);
  }

  if (!item.DynamicFields?.CPU) {
    warnings.push(`${item.Title}: Missing CPU`);
  }

  if (!item.DynamicFields?.DisplaySize) {
    warnings.push(`${item.Title}: Missing DisplaySize`);
  }

  if (!item.DynamicFields?.BatteryCapacity) {
    warnings.push(`${item.Title}: Missing BatteryCapacity`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check for duplicates by platform identifier
 */
export function findDuplicates(items: MappedItem[]): Map<string, number[]> {
  const seen = new Map<string, number[]>();

  items.forEach((item, index) => {
    const key =
      item.PlatformIdentifiers.phonearena ||
      item.PlatformIdentifiers.gsmarena ||
      item.PlatformIdentifiers.sourceUrl;

    if (!key) return;

    if (seen.has(key)) {
      seen.get(key)!.push(index);
    } else {
      seen.set(key, [index]);
    }
  });

  // Filter to only duplicates
  const duplicates = new Map<string, number[]>();
  seen.forEach((indices, key) => {
    if (indices.length > 1) {
      duplicates.set(key, indices);
    }
  });

  return duplicates;
}
