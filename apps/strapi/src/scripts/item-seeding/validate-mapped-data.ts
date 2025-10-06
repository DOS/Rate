/**
 * Validate mapped PhoneArena data trước khi push vào Strapi
 *
 * Usage:
 *   yarn tsx src/scripts/item-seeding/validate-mapped-data.ts <MAPPED_JSON_FILE>
 *
 * Example:
 *   yarn tsx src/scripts/item-seeding/validate-mapped-data.ts Data/mapped/mapped-1759413629261.json
 */

import * as fs from 'fs';
import * as path from 'path';

interface MappedItem {
  Name: string;
  Source: string;
  SourceURL: string;
  PhoneArenaID: string;
  AnnouncedDate: Date | null;
  Specs: Record<string, any>;
  PublishedAt: null;
  Locale: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate single item
 */
function validateItem(item: MappedItem, index: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // CRITICAL: Required fields
  if (!item.Name || item.Name.trim() === '') {
    errors.push(`[${index}] Name is required`);
  }

  if (!item.PhoneArenaID || item.PhoneArenaID.trim() === '') {
    errors.push(`[${index}] PhoneArenaID is required (for duplicate detection)`);
  }

  if (!item.SourceURL || !item.SourceURL.startsWith('https://www.phonearena.com')) {
    errors.push(`[${index}] SourceURL must be valid PhoneArena URL`);
  }

  // IMPORTANT: Specs data completeness
  if (!item.Specs || Object.keys(item.Specs).length === 0) {
    errors.push(`[${index}] Specs is empty - no data to import`);
  }

  // Warnings for missing important fields
  if (!item.AnnouncedDate) {
    warnings.push(`[${index}] ${item.Name}: Missing AnnouncedDate`);
  }

  if (!item.Specs?.Chipset) {
    warnings.push(`[${index}] ${item.Name}: Missing Chipset`);
  }

  if (!item.Specs?.CPU) {
    warnings.push(`[${index}] ${item.Name}: Missing CPU`);
  }

  if (!item.Specs?.DisplaySize) {
    warnings.push(`[${index}] ${item.Name}: Missing DisplaySize`);
  }

  if (!item.Specs?.BatteryCapacity) {
    warnings.push(`[${index}] ${item.Name}: Missing BatteryCapacity`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check for duplicates in mapped data
 */
function checkDuplicates(items: MappedItem[]): string[] {
  const errors: string[] = [];
  const seenIds = new Map<string, number>();

  items.forEach((item, index) => {
    if (seenIds.has(item.PhoneArenaID)) {
      errors.push(
        `Duplicate PhoneArenaID "${item.PhoneArenaID}" at index ${index} and ${seenIds.get(item.PhoneArenaID)}`
      );
    } else {
      seenIds.set(item.PhoneArenaID, index);
    }
  });

  return errors;
}

/**
 * Main validation function
 */
async function validateMappedData(jsonFilePath: string) {
  console.log('='.repeat(80));
  console.log('VALIDATE PHONEARENA MAPPED DATA');
  console.log('='.repeat(80));
  console.log();

  // Read mapped JSON file
  const absolutePath = path.isAbsolute(jsonFilePath)
    ? jsonFilePath
    : path.join(process.cwd(), jsonFilePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found: ${absolutePath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(absolutePath, 'utf-8');
  const mappedItems: MappedItem[] = JSON.parse(rawData);

  console.log(`📂 Loaded ${mappedItems.length} items from ${path.basename(jsonFilePath)}\n`);

  // Check duplicates
  console.log('🔍 Checking for duplicates...');
  const duplicateErrors = checkDuplicates(mappedItems);
  if (duplicateErrors.length > 0) {
    console.error('❌ Found duplicates:');
    duplicateErrors.forEach((err) => console.error(`   ${err}`));
    console.log();
  } else {
    console.log('✅ No duplicates found\n');
  }

  // Validate each item
  console.log('🔍 Validating items...\n');
  let validCount = 0;
  let invalidCount = 0;
  const allErrors: string[] = [...duplicateErrors];
  const allWarnings: string[] = [];

  mappedItems.forEach((item, index) => {
    const result = validateItem(item, index);

    if (result.valid) {
      validCount++;
      console.log(`[${index + 1}/${mappedItems.length}] ✅ ${item.Name}`);
    } else {
      invalidCount++;
      console.log(`[${index + 1}/${mappedItems.length}] ❌ ${item.Name}`);
      result.errors.forEach((err) => {
        console.error(`   ERROR: ${err}`);
        allErrors.push(err);
      });
    }

    result.warnings.forEach((warn) => {
      console.warn(`   WARNING: ${warn}`);
      allWarnings.push(warn);
    });
  });

  console.log();
  console.log('='.repeat(80));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total items:   ${mappedItems.length}`);
  console.log(`Valid items:   ${validCount} ✅`);
  console.log(`Invalid items: ${invalidCount} ❌`);
  console.log(`Errors:        ${allErrors.length}`);
  console.log(`Warnings:      ${allWarnings.length}`);
  console.log('='.repeat(80));

  if (allErrors.length > 0) {
    console.log();
    console.error('❌ VALIDATION FAILED - Fix errors before pushing to Strapi');
    process.exit(1);
  } else if (allWarnings.length > 0) {
    console.log();
    console.warn('⚠️  VALIDATION PASSED WITH WARNINGS');
    console.warn('   Review warnings and proceed with caution');
    process.exit(0);
  } else {
    console.log();
    console.log('✅ VALIDATION PASSED - Safe to push to Strapi');
    process.exit(0);
  }
}

// CLI
const jsonFilePath = process.argv[2];

if (!jsonFilePath) {
  console.error('❌ Usage: yarn tsx validate-mapped-data.ts <MAPPED_JSON_FILE>');
  console.error(
    '   Example: yarn tsx validate-mapped-data.ts Data/mapped/mapped-1759413629261.json'
  );
  process.exit(1);
}

validateMappedData(jsonFilePath).catch((error) => {
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
