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

    // Infra errors must abort ingestion (plan v7 §5.1): a failed lookup must
    // never fall through to Tier 3 and silently split the canonical cluster.
    if (exactErr) {
      throw new Error(`[EntityMatcher] Tier 1 exact lookup failed: ${exactErr.message}`);
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

    // Same rule for Tier 2: RPC/infra failure aborts; only a genuine
    // "no match above threshold" reaches Tier 3 (plan v7 §5.1).
    if (fuzzyErr) {
      throw new Error(`[EntityMatcher] Tier 2 fuzzy match failed: ${fuzzyErr.message}`);
    }
    let ambiguousFuzzy = false;
    if (Array.isArray(fuzzyMatches) && fuzzyMatches.length > 0) {
      const topMatch = fuzzyMatches[0];
      if (topMatch.similarity >= 0.70) {
        console.log(
          `[EntityMatcher] Tier 2 Fuzzy Match found: "${candidate.name}" ~= "${topMatch.name}" (similarity: ${(topMatch.similarity * 100).toFixed(1)}%) -> ID: ${topMatch.master_id}`
        );
        return { masterId: topMatch.master_id, isNew: false };
      }
      // Candidates exist but all below the accept threshold: identity is
      // uncertain -> seed as draft (plan v7 §5.1), never auto-publish.
      ambiguousFuzzy = true;
      console.log(`[EntityMatcher] Tier 2 best similarity ${(topMatch.similarity * 100).toFixed(1)}% < 70%: seeding as draft if new.`);
    }

    // Tier 3: No existing master product matches -> Seed a new Master Product.
    // - Upsert on model_key (unique) so a concurrent crawler inserting the same
    //   canonical entity resolves instead of crashing (plan v7 §5.1 / Gemini B3).
    // - Low-confidence identities (unparseable storage etc.) are seeded as
    //   'draft', never auto-published; the live status CHECK allows only
    //   draft/published/archived, so 'draft' is the needs-review state.
    const seedStatus = candidate.needs_review || ambiguousFuzzy ? 'draft' : 'published';
    console.log(`[EntityMatcher] Tier 3: Creating new canonical Master Product: ${candidate.name} (status: ${seedStatus})...`);

    // Insert-only with ignoreDuplicates: the LOSING worker must refetch the
    // winner WITHOUT overwriting its canonical metadata or status (Codex
    // blocker: a re-asserting upsert could re-publish a draft/archived master).
    const { data: createdRows, error: createErr } = await this.supabase
      .from('master_products')
      .upsert(
        {
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
          status: seedStatus,
        },
        { onConflict: 'model_key', ignoreDuplicates: true }
      )
      .select('id');

    if (createErr) {
      throw new Error(`Failed to create master product: ${createErr.message}`);
    }
    if (Array.isArray(createdRows) && createdRows.length > 0) {
      const createdMaster = createdRows[0];
      console.log(`[EntityMatcher] Successfully created Master Product ID: ${createdMaster.id}`);
      return { masterId: createdMaster.id, isNew: true };
    }

    // Lost the race: another worker inserted this model_key first. Adopt the
    // winner as-is (its status/identity decisions stay authoritative).
    const { data: winner, error: winnerErr } = await this.supabase
      .from('master_products')
      .select('id')
      .eq('model_key', candidate.model_key)
      .maybeSingle();
    if (winnerErr || !winner) {
      throw new Error(`Master product race lost and winner fetch failed: ${winnerErr?.message}`);
    }
    console.log(`[EntityMatcher] Master product already existed (race): ${winner.id}`);
    return { masterId: winner.id, isNew: false };
  }
}
