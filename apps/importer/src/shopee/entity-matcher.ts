import type { NormalizedProductCandidate } from './product-normalizer.js';
import { AiSpecEnricher } from './ai-spec-enricher.js';
import { createImporterLogger } from './logger.js';
import type { RateSupabaseClient } from './types.js';

const logger = createImporterLogger('EntityMatcher');

/** Minimum pg_trgm similarity returned from RPC so ambiguous near-misses (0.65..0.69) can be flagged as draft */
export const ENTITY_MATCH_CANDIDATE_FLOOR = 0.65;
/** Minimum pg_trgm similarity required to auto-merge into an existing Master Product */
export const ENTITY_MATCH_ACCEPT_THRESHOLD = 0.7;

export class EntityMatcher {
  private enricher: AiSpecEnricher;

  constructor(
    private supabase: RateSupabaseClient,
    enricher?: AiSpecEnricher
  ) {
    this.enricher = enricher ?? new AiSpecEnricher();
  }

  /**
   * Resolves an existing canonical Master Product or creates a new one using 3-tier matching
   */
  public async resolveOrCreateMasterProduct(
    candidate: NormalizedProductCandidate,
    categoryId?: string,
    rawTitle?: string
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
      logger.info(
        'entity_match.tier1_exact',
        `Tier 1 Exact Match found: ${exactMatch.name} (${exactMatch.model_key}) -> ID: ${exactMatch.id}`,
        { masterId: exactMatch.id, modelKey: exactMatch.model_key }
      );
      return { masterId: exactMatch.id, isNew: false };
    }

    // Tier 2: Trigram Fuzzy Match using Postgres pg_trgm (strictly constrained by brand and model series)
    const { data: fuzzyMatches, error: fuzzyErr } = await this.supabase.rpc(
      'match_master_product',
      {
        search_title: candidate.name,
        p_brand: candidate.brand,
        p_model: candidate.model,
        p_storage_gb: candidate.storage_gb,
        p_similarity_threshold: ENTITY_MATCH_CANDIDATE_FLOOR,
      }
    );

    // Same rule for Tier 2: RPC/infra failure aborts; only a genuine
    // "no match above threshold" reaches Tier 3 (plan v7 §5.1).
    if (fuzzyErr) {
      throw new Error(`[EntityMatcher] Tier 2 fuzzy match failed: ${fuzzyErr.message}`);
    }
    let ambiguousFuzzy = false;
    if (Array.isArray(fuzzyMatches) && fuzzyMatches.length > 0) {
      const topMatch = fuzzyMatches[0];
      if (topMatch.similarity >= ENTITY_MATCH_ACCEPT_THRESHOLD) {
        logger.info(
          'entity_match.tier2_fuzzy',
          `Tier 2 Fuzzy Match found: "${candidate.name}" ~= "${topMatch.name}" (similarity: ${(topMatch.similarity * 100).toFixed(1)}%) -> ID: ${topMatch.master_id}`,
          {
            masterId: topMatch.master_id,
            similarity: topMatch.similarity,
            candidateName: candidate.name,
          }
        );
        return { masterId: topMatch.master_id, isNew: false };
      }
      // Candidates exist but all below the accept threshold: identity is
      // uncertain -> seed as draft (plan v7 §5.1), never auto-publish.
      ambiguousFuzzy = true;
      logger.warn(
        'entity_match.tier2_ambiguous',
        `Tier 2 best similarity ${(topMatch.similarity * 100).toFixed(1)}% < ${(ENTITY_MATCH_ACCEPT_THRESHOLD * 100).toFixed(0)}%: seeding as draft if new.`,
        { similarity: topMatch.similarity, modelKey: candidate.model_key }
      );
    }

    // Tier 3: No existing master product matches -> Enrich with AI Spec Enricher (if not in local benchmark registry)
    // and seed a new Master Product.
    candidate = await this.enricher.enrichCandidate(candidate, rawTitle);

    // - Upsert on model_key (unique) so a concurrent crawler inserting the same
    //   canonical entity resolves instead of crashing (plan v7 §5.1 / Gemini B3).
    // - Low-confidence identities (unparseable storage, non-new condition,
    //   ambiguous trigram match, or unverified AI/heuristic specs) are seeded as
    //   'draft', never auto-published; the live status CHECK allows only
    //   draft/published/archived, so 'draft' is the needs-review state.
    const isUnverifiedSpec =
      candidate.spec_source === 'ai_unverified' ||
      candidate.spec_source === 'crawled_title' ||
      !candidate.is_benchmark_enriched;
    const seedStatus =
      candidate.needs_review || ambiguousFuzzy || isUnverifiedSpec ? 'draft' : 'published';
    logger.info(
      'entity_match.tier3_create_start',
      `Tier 3: Creating new canonical Master Product: ${candidate.name} (status: ${seedStatus}, spec_source: ${candidate.spec_source ?? 'unknown'})...`,
      {
        modelKey: candidate.model_key,
        seedStatus,
        specSource: candidate.spec_source ?? 'unknown',
      }
    );

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
      logger.info(
        'entity_match.tier3_created',
        `Successfully created Master Product ID: ${createdMaster.id}`,
        { masterId: createdMaster.id, modelKey: candidate.model_key, seedStatus }
      );
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
    logger.info(
      'entity_match.tier3_race_winner',
      `Master product already existed (race): ${winner.id}`,
      { masterId: winner.id, modelKey: candidate.model_key }
    );
    return { masterId: winner.id, isNew: false };
  }

  /**
   * Enriches an existing Master Product row in Supabase with full 10-Field-Group specs via AI
   */
  public async enrichMasterProductById(masterId: string): Promise<boolean> {
    const { data: row, error: fetchErr } = await this.supabase
      .from('master_products')
      .select(
        'id, brand, model, storage_gb, ram_gb, screen_size_inch, battery_mah, has_5g, name, description, colors'
      )
      .eq('id', masterId)
      .maybeSingle();

    if (fetchErr || !row) {
      throw new Error(`[EntityMatcher] Master product ${masterId} not found: ${fetchErr?.message}`);
    }

    const aiResult = await this.enricher.fetchSpecsFromAi({
      brand: row.brand,
      model: row.model,
      storageGb: row.storage_gb,
      ramGb: row.ram_gb,
      rawTitle: row.name,
      rawDescription: row.description,
    });

    if (!aiResult) {
      return false;
    }

    if (Array.isArray(row.colors) && row.colors.length > 0 && aiResult.specifications.design) {
      aiResult.specifications.design.colors = row.colors;
    }

    const { error: updateErr } = await this.supabase
      .from('master_products')
      .update({
        ram_gb: row.ram_gb ?? aiResult.ram_gb,
        screen_size_inch: row.screen_size_inch ?? aiResult.screen_size_inch,
        battery_mah: row.battery_mah ?? aiResult.battery_mah,
        has_5g: aiResult.has_5g ?? row.has_5g,
        specifications: aiResult.specifications,
        key_specs: aiResult.key_specs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', masterId);

    if (updateErr) {
      throw new Error(
        `[EntityMatcher] Failed to update enriched specs for ${masterId}: ${updateErr.message}`
      );
    }

    return true;
  }
}
