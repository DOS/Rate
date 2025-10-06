/**
 * Item Normalizer Service
 * Use GPT-4o-mini to normalize and translate product data
 */

import type { MergedData, NormalizedItemData } from '../crawlers/types.js';
import OpenAI from 'openai';
import { CORE_SPECS_BY_CATEGORY } from '../crawlers/config.js';

export class ItemNormalizer {
  private openai: OpenAI;
  private model: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  /**
   * Normalize merged data with AI
   * @param merged - Merged data from multiple sources
   * @returns Normalized data in both Vietnamese and English
   */
  async normalize(merged: MergedData): Promise<NormalizedItemData> {
    console.log(`  🤖 AI normalizing data for: ${merged.name}`);

    const prompt = this.buildPrompt(merged);

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a product data specialist. Your job is to normalize, translate, and structure product data for an e-commerce database.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        // Note: temperature parameter removed as gpt-4o-mini only supports default value (1)
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('Empty response from AI');
      }

      const normalized = JSON.parse(content) as NormalizedItemData;

      // Validate AI output
      this.validateNormalizedData(normalized);

      console.log(
        `    ✓ Quality: ${(normalized.quality.completeness * 100).toFixed(0)}% complete, ${(normalized.quality.confidence * 100).toFixed(0)}% confidence`
      );

      if (normalized.quality.missingFields.length > 0) {
        console.log(`    ⚠️  Missing fields: ${normalized.quality.missingFields.join(', ')}`);
      }

      return normalized;
    } catch (error) {
      console.error(`    ❌ AI normalization failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get core specs for a category
   */
  private getCoreSpecsForCategory(category: string): string[] {
    return CORE_SPECS_BY_CATEGORY[category as keyof typeof CORE_SPECS_BY_CATEGORY] || [];
  }

  /**
   * Build prompt for AI normalization
   */
  private buildPrompt(merged: MergedData): string {
    return `
Normalize this product data for database storage. The product is: ${merged.name}

Source Data:
${JSON.stringify(merged, null, 2)}

Your Tasks:
1. Create consistent Vietnamese and English versions
2. Standardize specification format (remove inconsistencies, units in consistent format)
3. Extract variants (colors, storage options, RAM options, etc.) if any
4. Generate SEO-friendly slug (lowercase, hyphen-separated, no special chars)
5. Categorize product correctly (phones, laptops, appliances, electronics)
6. Extract key features (top 5-7 most important highlights)
7. Create short description (2-3 sentences, concise and informative)
8. Create full description (1-2 paragraphs, detailed)
9. Score data quality (completeness 0-1, confidence 0-1)

Important Rules:
- Vietnamese names should be natural (e.g., "iPhone 16 Pro Max" stays as is)
- Vietnamese descriptions should be native, not translated literally
- Specifications should keep technical terms in English within Vietnamese text
- Slug should be URL-safe
- Key features should highlight unique selling points
- Quality scoring based on CORE SPECS for the category:
  * Category: ${merged.category}
  * Core specs for ${merged.category}:
    ${this.getCoreSpecsForCategory(merged.category).map((s) => `- ${s}`).join('\n    ')}

  * completeness: (filled core specs / total core specs)
    - Example: If 6 out of 9 core specs filled = 0.67 (67%)
    - Count ONLY the core specs listed above, NOT all possible specs
    - Minor missing details within a category (e.g., exact weight variant) do NOT reduce the category score
    - ≥60% = good enough for auto-create
    - 40-60% = needs review
    - <40% = insufficient data

  * confidence: source reliability (0-1)
    - GSMArena/NotebookCheck = 0.95
    - PhoneArena = 0.90
    - Official brands = 0.98
    - Wikipedia = 0.85

  * missingFields: list ONLY core spec CATEGORIES that are missing (e.g., "Battery", "Camera"), NOT minor details

Return JSON with this exact structure:
{
  "vi": {
    "name": "string (product name in Vietnamese)",
    "slug": "string (SEO-friendly URL slug)",
    "description": "string (full description 1-2 paragraphs)",
    "shortDescription": "string (2-3 sentences)",
    "brand": "string (brand name)",
    "model": "string (model identifier)",
    "category": "phones|laptops|appliances|electronics",
    "specifications": {
      "Category Name": {
        "Spec Key": "Spec Value"
      }
    },
    "keyFeatures": ["feature1", "feature2", ...],
    "variants": [{"name": "Màu sắc", "value": "Xanh, Đỏ, Trắng"}],
    "images": ["url1", "url2", ...],
    "metadata": {
      "releaseDate": "string",
      "popularity": "string",
      "sources": []
    }
  },
  "en": {
    "name": "string (product name in English)",
    "slug": "string (same as vi.slug)",
    "description": "string (full description in English)",
    "shortDescription": "string (2-3 sentences in English)",
    "brand": "string (same as vi.brand)",
    "model": "string (same as vi.model)",
    "category": "same as vi.category",
    "specifications": {
      "Category Name": {
        "Spec Key": "Spec Value"
      }
    },
    "keyFeatures": ["feature1", "feature2", ...],
    "variants": [{"name": "Color", "value": "Blue, Red, White"}],
    "images": ["url1", "url2", ...],
    "metadata": {
      "releaseDate": "string",
      "popularity": "string",
      "sources": []
    }
  },
  "quality": {
    "completeness": 0.95,
    "confidence": 0.90,
    "missingFields": ["field1", "field2"]
  }
}
`;
  }

  /**
   * Validate normalized data structure
   */
  private validateNormalizedData(data: NormalizedItemData): void {
    if (!data.vi || !data.en) {
      throw new Error('Missing vi or en translations');
    }

    if (!data.vi.name || !data.en.name) {
      throw new Error('Missing product name');
    }

    if (!data.vi.slug || !data.en.slug) {
      throw new Error('Missing slug');
    }

    if (!data.vi.category || !data.en.category) {
      throw new Error('Missing category');
    }

    if (!data.quality) {
      throw new Error('Missing quality assessment');
    }

    // Validate quality scores
    if (data.quality.completeness < 0 || data.quality.completeness > 1) {
      throw new Error('Invalid completeness score (must be 0-1)');
    }

    if (data.quality.confidence < 0 || data.quality.confidence > 1) {
      throw new Error('Invalid confidence score (must be 0-1)');
    }
  }

  /**
   * Calculate data completeness score
   * (Backup method if AI doesn't provide accurate score)
   */
  calculateCompleteness(data: any): number {
    const requiredFields = [
      'name',
      'slug',
      'description',
      'shortDescription',
      'brand',
      'category',
      'specifications',
      'images',
    ];

    const optionalFields = ['model', 'keyFeatures', 'variants', 'metadata'];

    let filledRequired = 0;
    let filledOptional = 0;

    for (const field of requiredFields) {
      if (data[field] && this.isFieldFilled(data[field])) {
        filledRequired++;
      }
    }

    for (const field of optionalFields) {
      if (data[field] && this.isFieldFilled(data[field])) {
        filledOptional++;
      }
    }

    // Required fields count 70%, optional 30%
    const requiredScore = (filledRequired / requiredFields.length) * 0.7;
    const optionalScore = (filledOptional / optionalFields.length) * 0.3;

    return requiredScore + optionalScore;
  }

  /**
   * Check if field is filled (not empty)
   */
  private isFieldFilled(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === 'object' && Object.keys(value).length === 0) return false;
    return true;
  }
}
