import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedProductCandidate } from './product-normalizer.js';

export class EntityMatcher {
  constructor(private supabase: SupabaseClient<any, 'rate'>) {}

  /**
   * Resolves an existing canonical Master Product or creates a new one using 3-tier matching
   */
  public async resolveOrCreateMasterProduct(
    candidate: NormalizedProductCandidate,
    categoryId?: string
  ): Promise<{ masterId: string; isNew: boolean }> {
    // Tier 1: Deterministic model_key matching
    const { data: exactMatch, error: exactErr } = await this.supabase
      .from('master_products')
      .select('id, name, model_key')
      .eq('model_key', candidate.model_key)
      .maybeSingle();

    if (exactErr) {
      console.warn(`[EntityMatcher] Tier 1 query warning: ${exactErr.message}`);
    }

    if (exactMatch) {
      console.log(`[EntityMatcher] Tier 1 Exact Match found: ${exactMatch.name} (${exactMatch.model_key}) -> ID: ${exactMatch.id}`);
      return { masterId: exactMatch.id, isNew: false };
    }

    // Tier 2: Trigram Fuzzy Match using Postgres pg_trgm (strictly constrained by brand and model series)
    const { data: fuzzyMatches, error: fuzzyErr } = await this.supabase.rpc('match_master_product', {
      search_title: candidate.name,
      p_brand: candidate.brand,
      p_model: candidate.model,
      p_storage_gb: candidate.storage_gb,
      p_similarity_threshold: 0.65,
    });

    if (!fuzzyErr && Array.isArray(fuzzyMatches) && fuzzyMatches.length > 0) {
      const topMatch = fuzzyMatches[0];
      if (topMatch.similarity >= 0.70) {
        console.log(
          `[EntityMatcher] Tier 2 Fuzzy Match found: "${candidate.name}" ~= "${topMatch.name}" (similarity: ${(topMatch.similarity * 100).toFixed(1)}%) -> ID: ${topMatch.master_id}`
        );
        return { masterId: topMatch.master_id, isNew: false };
      }
    }

    // Tier 3: No existing master product matches -> Seed a new Master Product
    console.log(`[EntityMatcher] Tier 3: Creating new canonical Master Product: ${candidate.name}...`);
    const { data: createdMaster, error: createErr } = await this.supabase
      .from('master_products')
      .insert({
        category_id: categoryId || null,
        brand: candidate.brand,
        model: candidate.model,
        variant_name: candidate.variant_name,
        model_key: candidate.model_key,
        name: candidate.name,
        slug: candidate.slug,
        description: candidate.description || '',
        ram_gb: candidate.ram_gb,
        storage_gb: candidate.storage_gb,
        screen_size_inch: candidate.screen_size_inch,
        battery_mah: candidate.battery_mah,
        has_5g: candidate.has_5g,
        specifications: candidate.specifications,
        key_specs: candidate.key_specs,
        images: candidate.images,
        thumbnail: candidate.images[0] || null,
        colors: candidate.colors,
        status: 'published',
      })
      .select('id')
      .single();

    if (createErr || !createdMaster) {
      // In case of unique slug / model_key race condition, retry fetch
      const { data: fallback } = await this.supabase
        .from('master_products')
        .select('id')
        .eq('model_key', candidate.model_key)
        .maybeSingle();

      if (fallback) {
        return { masterId: fallback.id, isNew: false };
      }
      throw new Error(`Failed to create master product: ${createErr?.message}`);
    }

    console.log(`[EntityMatcher] Successfully created Master Product ID: ${createdMaster.id}`);
    return { masterId: createdMaster.id, isNew: true };
  }
}
