/**
 * Item Validator Service
 * Validate data quality before Item creation
 */

import type { NormalizedItemData, ValidationResult } from '../crawlers/types.js';
import { QUALITY_THRESHOLDS } from '../crawlers/config.js';

export class ItemValidator {
  /**
   * Validate normalized item data
   * @param data - Normalized data
   * @returns Validation result with pass/fail and issues
   */
  validate(data: NormalizedItemData): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];

    // 1. Check required fields (Vietnamese)
    if (!data.vi.name || data.vi.name.trim() === '') {
      issues.push('Vietnamese name is missing');
    }

    if (!data.vi.slug || data.vi.slug.trim() === '') {
      issues.push('Slug is missing');
    }

    if (!data.vi.brand || data.vi.brand.trim() === '') {
      issues.push('Brand is missing');
    }

    if (!data.vi.category || !['phones', 'laptops', 'appliances', 'electronics'].includes(data.vi.category)) {
      issues.push('Invalid or missing category');
    }

    // 2. Check required fields (English)
    if (!data.en.name || data.en.name.trim() === '') {
      issues.push('English name is missing');
    }

    if (!data.en.slug || data.en.slug.trim() === '') {
      issues.push('English slug is missing');
    }

    // 3. Check specifications
    const viSpecCount = Object.keys(data.vi.specifications || {}).length;
    const enSpecCount = Object.keys(data.en.specifications || {}).length;

    if (viSpecCount < QUALITY_THRESHOLDS.MIN_SPEC_CATEGORIES) {
      issues.push(
        `Not enough specification categories (${viSpecCount}/${QUALITY_THRESHOLDS.MIN_SPEC_CATEGORIES} minimum)`
      );
    }

    if (enSpecCount < QUALITY_THRESHOLDS.MIN_SPEC_CATEGORIES) {
      warnings.push(`English specifications incomplete (${enSpecCount} categories)`);
    }

    // 4. Check images
    if (!data.vi.images || data.vi.images.length < QUALITY_THRESHOLDS.MIN_IMAGES) {
      issues.push(`Not enough images (${data.vi.images?.length || 0}/${QUALITY_THRESHOLDS.MIN_IMAGES} minimum)`);
    }

    // 5. Check descriptions
    if (!data.vi.description || data.vi.description.trim().length < 50) {
      warnings.push('Vietnamese description too short');
    }

    if (!data.vi.shortDescription || data.vi.shortDescription.trim().length < 20) {
      warnings.push('Vietnamese short description too short');
    }

    if (!data.en.description || data.en.description.trim().length < 50) {
      warnings.push('English description too short');
    }

    // 6. Check quality scores
    if (data.quality.completeness < QUALITY_THRESHOLDS.MIN_COMPLETENESS) {
      issues.push(
        `Data completeness too low (${(data.quality.completeness * 100).toFixed(0)}% < ${QUALITY_THRESHOLDS.MIN_COMPLETENESS * 100}%)`
      );
    }

    if (data.quality.confidence < 0.7) {
      warnings.push(`AI confidence low (${(data.quality.confidence * 100).toFixed(0)}%)`);
    }

    // 7. Check key features
    if (!data.vi.keyFeatures || data.vi.keyFeatures.length < 3) {
      warnings.push('Not enough key features (minimum 3 recommended)');
    }

    // 8. Check slug format
    if (!this.isValidSlug(data.vi.slug)) {
      issues.push('Invalid slug format (must be lowercase, hyphen-separated, no special chars)');
    }

    // Calculate overall score
    const maxPossibleIssues = 10; // Rough estimate of total checks
    const score = Math.max(0, 1 - issues.length / maxPossibleIssues);

    return {
      valid: issues.length === 0 && score >= QUALITY_THRESHOLDS.MIN_COMPLETENESS,
      score,
      issues,
      warnings,
    };
  }

  /**
   * Validate slug format
   */
  private isValidSlug(slug: string): boolean {
    // Slug must be lowercase, hyphen-separated, no special chars
    const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    return slugRegex.test(slug);
  }

  /**
   * Get validation summary
   */
  getValidationSummary(result: ValidationResult): string {
    if (result.valid) {
      return `✅ PASS (score: ${(result.score * 100).toFixed(0)}%)`;
    }

    const summary = [
      `❌ FAIL (score: ${(result.score * 100).toFixed(0)}%)`,
      `Issues: ${result.issues.length}`,
      ...result.issues.map((issue) => `  - ${issue}`),
    ];

    if (result.warnings.length > 0) {
      summary.push(`Warnings: ${result.warnings.length}`);
      summary.push(...result.warnings.map((warning) => `  - ${warning}`));
    }

    return summary.join('\n');
  }

  /**
   * Check if data meets auto-create threshold
   */
  meetsAutoCreateThreshold(data: NormalizedItemData): boolean {
    return (
      data.quality.completeness >= QUALITY_THRESHOLDS.AUTO_CREATE_CONFIDENCE &&
      data.quality.confidence >= QUALITY_THRESHOLDS.AUTO_CREATE_CONFIDENCE
    );
  }

  /**
   * Check if data should go to review queue
   */
  needsReview(data: NormalizedItemData): boolean {
    return (
      (data.quality.completeness >= QUALITY_THRESHOLDS.REVIEW_QUEUE_CONFIDENCE &&
        data.quality.completeness < QUALITY_THRESHOLDS.AUTO_CREATE_CONFIDENCE) ||
      (data.quality.confidence >= QUALITY_THRESHOLDS.REVIEW_QUEUE_CONFIDENCE &&
        data.quality.confidence < QUALITY_THRESHOLDS.AUTO_CREATE_CONFIDENCE)
    );
  }
}
