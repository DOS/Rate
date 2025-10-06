/**
 * Item Merger Service
 * Intelligently merge data from multiple sources
 */

import type { CrawledData, MergedData } from '../crawlers/types.js';

export class ItemMerger {
  /**
   * Merge data from multiple crawled sources
   * @param crawledData - Array of data from different sources
   * @returns Merged data combining all sources
   */
  merge(crawledData: CrawledData[]): MergedData {
    if (crawledData.length === 0) {
      throw new Error('No data to merge');
    }

    // Sort by reliability (highest first)
    const sorted = crawledData.sort((a, b) => b.reliability - a.reliability);

    // Start with most reliable source
    const primary = sorted[0];
    const merged: MergedData = {
      name: primary.data.name,
      brand: this.extractBrand(primary.data.name),
      specifications: {},
      images: [],
      description: primary.data.metadata.releaseDate || '',
      quickSpecs: primary.data.quickSpecs || [],
      sources: crawledData.map((s) => ({
        name: s.source,
        url: s.data.metadata.sourceUrl,
        reliability: s.reliability,
      })),
      metadata: {
        ...primary.data.metadata,
      },
    };

    // Merge specifications from all sources
    const allSpecs: Record<
      string,
      Record<
        string,
        {
          value: string;
          source: string;
          reliability: number;
        }
      >
    > = {};

    for (const source of sorted) {
      for (const [category, specs] of Object.entries(source.data.specifications)) {
        if (!allSpecs[category]) {
          allSpecs[category] = {};
        }

        // Merge specs within category
        for (const [key, value] of Object.entries(specs)) {
          // Only add if:
          // 1. Key doesn't exist yet, OR
          // 2. Current source has higher reliability
          if (!allSpecs[category][key] || allSpecs[category][key].reliability < source.reliability) {
            allSpecs[category][key] = {
              value: value,
              source: source.source,
              reliability: source.reliability,
            };
          }
        }
      }
    }

    // Flatten to final format (remove metadata)
    merged.specifications = Object.fromEntries(
      Object.entries(allSpecs).map(([category, specs]) => [
        category,
        Object.fromEntries(Object.entries(specs).map(([key, data]) => [key, data.value])),
      ])
    );

    // Merge images (deduplicate)
    const allImages = sorted.flatMap((s) => s.data.images || []);
    merged.images = [...new Set(allImages)];

    // Merge quick specs (deduplicate)
    const allQuickSpecs = sorted.flatMap((s) => s.data.quickSpecs || []);
    merged.quickSpecs = [...new Set(allQuickSpecs)];

    console.log(`  🔄 Merged ${sorted.length} sources:`);
    console.log(`     - ${Object.keys(merged.specifications).length} spec categories`);
    console.log(`     - ${merged.images.length} images`);
    console.log(`     - ${merged.quickSpecs?.length || 0} quick specs`);

    return merged;
  }

  /**
   * Extract brand from product name
   * @param name - Product name
   * @returns Brand name
   */
  private extractBrand(name: string): string {
    const brands = [
      'iPhone',
      'iPad',
      'MacBook',
      'Samsung',
      'Galaxy',
      'Xiaomi',
      'Redmi',
      'OnePlus',
      'Google',
      'Pixel',
      'Oppo',
      'Vivo',
      'Realme',
      'Nokia',
      'Huawei',
      'Honor',
      'Asus',
      'Sony',
      'LG',
      'Motorola',
      'Dell',
      'HP',
      'Lenovo',
      'Acer',
      'MSI',
      'ThinkPad',
    ];

    const nameLower = name.toLowerCase();

    for (const brand of brands) {
      if (nameLower.includes(brand.toLowerCase())) {
        // Map variations to canonical brand
        if (brand === 'iPhone' || brand === 'iPad' || brand === 'MacBook') {
          return 'Apple';
        }
        if (brand === 'Galaxy') {
          return 'Samsung';
        }
        if (brand === 'Redmi') {
          return 'Xiaomi';
        }
        if (brand === 'Pixel') {
          return 'Google';
        }
        if (brand === 'ThinkPad') {
          return 'Lenovo';
        }
        return brand;
      }
    }

    // If no brand found, extract first word
    return name.split(' ')[0];
  }

  /**
   * Validate merged data quality
   * @param merged - Merged data
   * @returns Validation result
   */
  validate(merged: MergedData): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!merged.name) {
      issues.push('Missing name');
    }

    if (!merged.brand) {
      issues.push('Missing brand');
    }

    if (Object.keys(merged.specifications).length < 3) {
      issues.push(`Only ${Object.keys(merged.specifications).length} specification categories`);
    }

    if (merged.images.length === 0) {
      issues.push('No images');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
