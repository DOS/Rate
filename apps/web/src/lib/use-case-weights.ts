/**
 * RTINGS-style category use-case presets, normalized 0..100 custom weight math,
 * per-criterion score extraction, and shareable URL query state (DOS/Rate#1864).
 *
 * Pure client-safe module: zero server-only imports.
 * Preserves Design Rule #1531 D3/D9:
 * - Official `Rate.vn Score` stays unchanged alongside `Your Custom Score`.
 * - Missing or unrated criteria are never fabricated; weights renormalize over
 *   rated criteria or return `null` when none exist.
 * - Decimal-safe rounding matches `weightedCriteriaScore5` (`roundScore(..., 2)`)
 *   and `displayedScore5` (`roundScore(..., 1)`).
 */
import type { MasterProduct } from '@repo/shared-data';
import {
  getRatingCriteria,
  getRatingCriterionLabel,
  getRatingUseCasePresetLabel,
  getRatingUseCasePresets,
  isRatingCriterionKey,
  type RatingCriterion,
  type RatingCriterionKey,
  type RatingUseCasePreset,
  type UseCasePresetId,
} from '@repo/shared-data/rules';
import {
  CRITERION_RANK_WRITERS,
  type LeaderboardCriteriaBreakdown,
  type LeaderboardCriteriaWeights,
} from './leaderboard-engine';
import { formatPercent } from './locale-format';
import {
  getMasterProductCategorySlug,
  resolveCompareEffectiveUserRating,
} from './rate-domain-core';
import { displayedScore5, roundScore } from './rating-display';
import type { PersonaPresetKey } from './versus-score';

export type ActiveWeightMode = UseCasePresetId | 'custom';

export type CategoryCriterionWeights = Partial<
  Record<RatingCriterionKey, number>
>;

export type CategoryCriteriaScores = Partial<
  Record<RatingCriterionKey, number | null>
>;

export interface NormalizedCategoryWeights {
  readonly sliderWeights: Record<RatingCriterionKey, number>;
  readonly normalizedPercent: Record<RatingCriterionKey, number>;
  readonly wasAllZeroReset: boolean;
}

export interface ParsedUseCaseUrlState {
  readonly mode: ActiveWeightMode;
  readonly weights: Record<RatingCriterionKey, number>;
  readonly normalizedPercent: Record<RatingCriterionKey, number>;
}

export interface CustomWeightedScoreResult {
  readonly customScore5: number | null;
  readonly displayedCustomScore5: number | null;
  readonly officialScore5: number;
  readonly displayedOfficialScore5: number;
  readonly ratedCriteriaCount: number;
  readonly totalCriteriaCount: number;
  readonly effectiveSharesPercent: Partial<Record<RatingCriterionKey, number>>;
}

const CONTROL_CHARS_RE = /\p{Cc}+/gu;
const HEX_BIN_OCT_RE = /^[+-]?0[xbo]/i;
const PRESET_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const WEIGHT_TOKEN_DECIMAL_RE = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/;
const MAX_QUERY_PARAM_LEN = 256;
const MAX_WEIGHT_TOKENS = 16;

const UNSAFE_OBJECT_KEYS = new Set<string>([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  if (UNSAFE_OBJECT_KEYS.has(key)) return undefined;
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}

function setSafeKey<V>(target: Record<string, V>, key: string, value: V): void {
  if (UNSAFE_OBJECT_KEYS.has(key)) return;
  target[key] = value;
}

/**
 * Sanitizes an interactive slider input into an integer `0..100`.
 * Rejects NaN, Infinity, control chars, hex/octal/binary prefixes, and
 * non-primitive values by falling back to `fallback` (clamped `0..100`).
 */
export function sanitizeSliderWeight(value: unknown, fallback = 0): number {
  const safeFallback =
    typeof fallback === 'number' && Number.isFinite(fallback)
      ? Math.max(0, Math.min(100, Math.round(fallback)))
      : 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return safeFallback;
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  if (typeof value === 'string') {
    if (/\p{Cc}/u.test(value)) return safeFallback;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 16 || HEX_BIN_OCT_RE.test(trimmed)) {
      return safeFallback;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return safeFallback;
    return Math.max(0, Math.min(100, Math.round(parsed)));
  }
  return safeFallback;
}

/**
 * Strict parser for URL query weight values (`?weights=camera:45,...`).
 * Rejects negative numbers, NaN, Infinity, values > 100, and non-decimal strings
 * rather than clamping huge or negative query input silently.
 */
function parseStrictQueryWeight(raw: string): number | null {
  if (/\p{Cc}/u.test(raw)) return null;
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.length > 12 ||
    !WEIGHT_TOKEN_DECIMAL_RE.test(trimmed)
  ) {
    return null;
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    return null;
  }
  return Math.round(num);
}

function normalizeCategorySlugInput(
  categorySlug: string | null | undefined
): string {
  if (typeof categorySlug !== 'string' || categorySlug.length > 64) {
    return 'smartphones';
  }
  const cleaned = categorySlug
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .toLowerCase();
  return cleaned || 'smartphones';
}

/**
 * Returns the category's Balanced Default weights from `@repo/shared-data/rules`
 * (`sum === 100`).
 */
export function defaultCategoryWeights(
  categorySlug: string | null | undefined
): Record<RatingCriterionKey, number> {
  const cat = normalizeCategorySlugInput(categorySlug);
  const out = {} as Record<RatingCriterionKey, number>;
  for (const criterion of getRatingCriteria(cat)) {
    setSafeKey(out, criterion.key, criterion.weight);
  }
  return out;
}

/**
 * Largest-remainder (Hare-Niemeyer) integer normalization to exact `100%`
 * using exact integer arithmetic (`(w * 100) / sum` and `(w * 100) % sum`).
 */
function largestRemainderPercent(
  orderedKeys: readonly RatingCriterionKey[],
  weights: Readonly<Record<string, number>>
): Partial<Record<RatingCriterionKey, number>> {
  const out: Partial<Record<RatingCriterionKey, number>> = {};
  let sum = 0;
  for (const key of orderedKeys) {
    const w = weights[key] ?? 0;
    if (w > 0) sum += w;
  }
  if (sum <= 0) {
    for (const key of orderedKeys) setSafeKey(out, key, 0);
    return out;
  }
  const entries = orderedKeys.map((key, index) => {
    const w = Math.max(0, weights[key] ?? 0);
    const scaled = w * 100;
    const floor = Math.floor(scaled / sum);
    const rem = scaled % sum;
    return { key, index, w, floor, rem };
  });
  let remainder = 100 - entries.reduce((acc, item) => acc + item.floor, 0);
  const byRemainder = [...entries].sort((a, b) => {
    if (b.rem !== a.rem) return b.rem - a.rem;
    if (b.w !== a.w) return b.w - a.w;
    return a.index - b.index;
  });
  const bonusKeys = new Set<RatingCriterionKey>();
  for (let i = 0; i < byRemainder.length && remainder > 0; i++) {
    const candidate = byRemainder[i];
    if (candidate && candidate.w > 0) {
      bonusKeys.add(candidate.key);
      remainder -= 1;
    }
  }
  for (const entry of entries) {
    setSafeKey(
      out,
      entry.key,
      entry.floor + (bonusKeys.has(entry.key) ? 1 : 0)
    );
  }
  return out;
}

/**
 * Normalizes custom `0..100` integer slider weights for a category so their
 * normalized shares always sum to exact `100%`.
 *
 * When all active criteria sliders are `0` (or `rawWeights` is invalid),
 * gracefully resets to Balanced Default (`wasAllZeroReset: true`).
 */
export function normalizeCategoryWeights(
  categorySlug: string | null | undefined,
  rawWeights: unknown,
  availableCriteria?: readonly RatingCriterionKey[]
): NormalizedCategoryWeights {
  const cat = normalizeCategorySlugInput(categorySlug);
  const criteria = getRatingCriteria(cat);
  const allKeys = criteria.map((c) => c.key);
  const activeSet =
    availableCriteria && availableCriteria.length > 0
      ? new Set<RatingCriterionKey>(
          availableCriteria.filter((k) => allKeys.includes(k))
        )
      : null;
  const effectiveActiveKeys =
    activeSet && activeSet.size > 0
      ? allKeys.filter((k) => activeSet.has(k))
      : allKeys;

  const defaults = defaultCategoryWeights(cat);
  const record = isPlainObject(rawWeights) ? rawWeights : null;

  const sliderWeights = {} as Record<RatingCriterionKey, number>;
  let activeRawSum = 0;

  if (record) {
    for (const criterion of criteria) {
      const rawVal = ownValue(record, criterion.key);
      const safeVal =
        rawVal === undefined ? 0 : sanitizeSliderWeight(rawVal, 0);
      setSafeKey(sliderWeights, criterion.key, safeVal);
      if (effectiveActiveKeys.includes(criterion.key)) {
        activeRawSum += safeVal;
      }
    }
  }

  if (!record || activeRawSum <= 0) {
    const resetNormalized = {} as Record<RatingCriterionKey, number>;
    for (const key of allKeys) setSafeKey(resetNormalized, key, 0);
    const activeShares = largestRemainderPercent(effectiveActiveKeys, defaults);
    for (const key of effectiveActiveKeys) {
      setSafeKey(resetNormalized, key, activeShares[key] ?? 0);
    }
    return {
      sliderWeights: { ...defaults },
      normalizedPercent: resetNormalized,
      wasAllZeroReset: true,
    };
  }

  const normalizedPercent = {} as Record<RatingCriterionKey, number>;
  for (const key of allKeys) setSafeKey(normalizedPercent, key, 0);
  const activeShares = largestRemainderPercent(
    effectiveActiveKeys,
    sliderWeights
  );
  for (const key of effectiveActiveKeys) {
    setSafeKey(normalizedPercent, key, activeShares[key] ?? 0);
  }

  return {
    sliderWeights,
    normalizedPercent,
    wasAllZeroReset: false,
  };
}

const PRESET_URL_ALIASES: Readonly<Record<string, UseCasePresetId>> = {
  balanced: 'default',
  none: 'default',
  standard: 'default',
  photography: 'camera',
  photo: 'camera',
  vlog: 'camera',
  value_hunter: 'value',
  best_value: 'value',
  anc: 'commute_anc',
  commute: 'commute_anc',
  calls: 'calls_work',
  meetings: 'calls_work',
  music: 'audiophile',
  sound: 'audiophile',
  study: 'study_work',
  productivity: 'study_work',
  health: 'fitness',
};

function mapCategoryPresetAlias(
  categorySlug: string | null | undefined,
  cleaned: string
): string {
  if (cleaned === 'business') {
    const cat = (categorySlug ?? '').toLowerCase().trim();
    if (cat === 'laptops') return 'office';
    if (cat === 'tablets') return 'study_work';
    if (cat === 'smartwatches') return 'smart_daily';
  }
  if (ownValue(PRESET_URL_ALIASES, cleaned) !== undefined) {
    return PRESET_URL_ALIASES[cleaned]!;
  }
  return cleaned;
}

/**
 * Resolves a preset id or URL alias for `categorySlug`, falling back safely to
 * `'default'` when unknown or unsafe (`__proto__`, `constructor`, etc.).
 */
export function resolveCategoryPreset(
  categorySlug: string | null | undefined,
  presetInput: unknown
): RatingUseCasePreset {
  const cat = normalizeCategorySlugInput(categorySlug);
  const presets = getRatingUseCasePresets(cat);
  const defaultPreset = presets[0]!;
  if (typeof presetInput !== 'string' || presetInput.length > 64) {
    return defaultPreset;
  }
  const cleaned = presetInput
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .toLowerCase();
  if (
    !cleaned ||
    UNSAFE_OBJECT_KEYS.has(cleaned) ||
    !PRESET_SLUG_RE.test(cleaned)
  ) {
    return defaultPreset;
  }
  const targetId = mapCategoryPresetAlias(cat, cleaned);
  const matched = presets.find((p) => p.id === targetId);
  return matched ?? defaultPreset;
}

/**
 * Returns presets worth offering when only `availableCriteria` have real scores
 * (`#1553` / `#1556`). Empty when `availableCriteria` has zero valid category keys.
 */
export function availableCategoryUseCasePresets(
  categorySlug: string | null | undefined,
  availableCriteria: readonly RatingCriterionKey[]
): RatingUseCasePreset[] {
  if (!availableCriteria || availableCriteria.length === 0) return [];
  const cat = normalizeCategorySlugInput(categorySlug);
  const availableSet = new Set<RatingCriterionKey>(availableCriteria);
  const presets = getRatingUseCasePresets(cat);
  const criteria = getRatingCriteria(cat);
  if (!criteria.some((c) => availableSet.has(c.key))) return [];
  return presets.filter((preset) => {
    if (preset.id === 'default') return true;
    let leadKey: RatingCriterionKey | null = null;
    let leadWeight = -1;
    for (const c of criteria) {
      const w = preset.weights[c.key] ?? 0;
      if (w > leadWeight) {
        leadWeight = w;
        leadKey = c.key;
      }
    }
    return leadKey !== null && availableSet.has(leadKey);
  });
}

export function isDefaultCategoryWeights(
  categorySlug: string | null | undefined,
  mode: ActiveWeightMode,
  weights: unknown,
  availableCriteria?: readonly RatingCriterionKey[]
): boolean {
  if (mode === 'default') return true;
  const cat = normalizeCategorySlugInput(categorySlug);
  const criteria = getRatingCriteria(cat);
  const allKeys = criteria.map((c) => c.key);
  const activeSet =
    availableCriteria && availableCriteria.length > 0
      ? new Set<RatingCriterionKey>(
          availableCriteria.filter((k) => allKeys.includes(k))
        )
      : null;
  const activeKeys =
    activeSet && activeSet.size > 0
      ? allKeys.filter((k) => activeSet.has(k))
      : allKeys;

  const normalized = normalizeCategoryWeights(cat, weights, availableCriteria);
  if (normalized.wasAllZeroReset) return true;
  const defaults = defaultCategoryWeights(cat);

  let sliderSum = 0;
  let defaultSum = 0;
  for (const key of activeKeys) {
    sliderSum += normalized.sliderWeights[key] ?? 0;
    defaultSum += defaults[key] ?? 0;
  }
  if (sliderSum <= 0 || defaultSum <= 0) return true;
  for (const key of activeKeys) {
    const w = normalized.sliderWeights[key] ?? 0;
    const d = defaults[key] ?? 0;
    if (w * defaultSum !== d * sliderSum) {
      return false;
    }
  }
  return true;
}

/**
 * Encodes custom slider weights compactly as `key:weight,key:weight` in canonical
 * category criterion order (omitting zero weights while keeping integer percentages
 * for display).
 */
export function serializeWeightsParam(
  categorySlug: string | null | undefined,
  rawWeights: unknown,
  availableCriteria?: readonly RatingCriterionKey[]
): string {
  const cat = normalizeCategorySlugInput(categorySlug);
  const criteria = getRatingCriteria(cat);
  const allKeys = criteria.map((c) => c.key);
  const activeSet =
    availableCriteria && availableCriteria.length > 0
      ? new Set<RatingCriterionKey>(
          availableCriteria.filter((k) => allKeys.includes(k))
        )
      : null;
  const normalized = normalizeCategoryWeights(
    cat,
    rawWeights,
    availableCriteria
  );
  if (normalized.wasAllZeroReset) return '';
  const parts: string[] = [];
  for (const criterion of criteria) {
    if (activeSet && activeSet.size > 0 && !activeSet.has(criterion.key)) {
      continue;
    }
    const weight = normalized.sliderWeights[criterion.key] ?? 0;
    if (weight > 0) {
      parts.push(`${criterion.key}:${weight}`);
    }
  }
  return parts.join(',');
}

/**
 * Parses a `?weights=...` query value strictly for `categorySlug`.
 * Rejects prototype keys, duplicate keys, foreign criteria, negative/NaN/huge
 * numbers, and oversized query strings. Returns `null` when invalid or all-zero.
 */
export function parseWeightsParam(
  categorySlug: string | null | undefined,
  rawParam: unknown
): Record<RatingCriterionKey, number> | null {
  if (typeof rawParam !== 'string' || rawParam.length > MAX_QUERY_PARAM_LEN) {
    return null;
  }
  if (/\p{Cc}/u.test(rawParam)) return null;
  const trimmed = rawParam.trim();
  if (!trimmed || trimmed.length > MAX_QUERY_PARAM_LEN) return null;

  const cat = normalizeCategorySlugInput(categorySlug);
  const criteria = getRatingCriteria(cat);
  const validKeys = new Set<RatingCriterionKey>(criteria.map((c) => c.key));
  const legacyKeyToCanonical = (key: string): RatingCriterionKey | null => {
    if (key === 'screen') {
      return cat === 'earbuds'
        ? 'sound'
        : validKeys.has('display')
          ? 'display'
          : null;
    }
    if (isRatingCriterionKey(key) && validKeys.has(key)) {
      return key;
    }
    return null;
  };

  const tokens = trimmed.split(',');
  if (tokens.length === 0 || tokens.length > MAX_WEIGHT_TOKENS) return null;

  const parsed = {} as Record<RatingCriterionKey, number>;
  for (const c of criteria) setSafeKey(parsed, c.key, 0);
  const seenKeys = new Set<RatingCriterionKey>();

  for (const rawToken of tokens) {
    const token = rawToken.trim();
    if (!token) return null;
    const colonIdx = token.indexOf(':');
    if (colonIdx <= 0 || token.indexOf(':', colonIdx + 1) !== -1) {
      return null;
    }
    const rawKey = token.slice(0, colonIdx).trim().toLowerCase();
    const rawVal = token.slice(colonIdx + 1).trim();
    if (!rawKey || UNSAFE_OBJECT_KEYS.has(rawKey)) {
      return null;
    }
    const canonicalKey = legacyKeyToCanonical(rawKey);
    if (!canonicalKey || seenKeys.has(canonicalKey)) {
      return null;
    }
    const weight = parseStrictQueryWeight(rawVal);
    if (weight === null) {
      return null;
    }
    seenKeys.add(canonicalKey);
    setSafeKey(parsed, canonicalKey, weight);
  }

  let finalPositiveSum = 0;
  for (const c of criteria) {
    finalPositiveSum += parsed[c.key] ?? 0;
  }
  if (seenKeys.size === 0 || finalPositiveSum <= 0) {
    return null;
  }
  return parsed;
}

type SearchParamsInput =
  | URLSearchParams
  | Readonly<Record<string, string | string[] | undefined>>
  | string
  | null
  | undefined;

function readFirstSearchParam(
  input: SearchParamsInput,
  key: 'preset' | 'weights'
): string | undefined {
  if (!input) return undefined;
  if (typeof input === 'string') {
    const q = input.startsWith('?') ? input.slice(1) : input;
    if (q.length > 2048) return undefined;
    const sp = new URLSearchParams(q);
    return sp.get(key) ?? undefined;
  }
  if (input instanceof URLSearchParams) {
    return input.get(key) ?? undefined;
  }
  if (isPlainObject(input)) {
    const v = ownValue(input, key);
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  }
  return undefined;
}

/**
 * Restores `{ mode, weights, normalizedPercent }` from URL query params
 * (`?preset=...` or `?weights=...`), falling back cleanly to Balanced Default
 * when absent, malformed, all-zero, or containing prototype keys.
 */
export function parseUseCaseWeightsFromParams(
  categorySlug: string | null | undefined,
  params: SearchParamsInput,
  availableCriteria?: readonly RatingCriterionKey[]
): ParsedUseCaseUrlState {
  const rawWeights = readFirstSearchParam(params, 'weights');
  if (rawWeights !== undefined && rawWeights.trim() !== '') {
    const parsedWeights = parseWeightsParam(categorySlug, rawWeights);
    if (parsedWeights) {
      const normalized = normalizeCategoryWeights(
        categorySlug,
        parsedWeights,
        availableCriteria
      );
      if (!normalized.wasAllZeroReset) {
        const isDef = isDefaultCategoryWeights(
          categorySlug,
          'custom',
          normalized.sliderWeights,
          availableCriteria
        );
        if (isDef) {
          const defNorm = normalizeCategoryWeights(
            categorySlug,
            defaultCategoryWeights(categorySlug),
            availableCriteria
          );
          return {
            mode: 'default',
            weights: defNorm.sliderWeights,
            normalizedPercent: defNorm.normalizedPercent,
          };
        }
        return {
          mode: 'custom',
          weights: normalized.sliderWeights,
          normalizedPercent: normalized.normalizedPercent,
        };
      }
    }
  }

  const rawPreset = readFirstSearchParam(params, 'preset');
  if (rawPreset !== undefined && rawPreset.trim() !== '') {
    const preset = resolveCategoryPreset(categorySlug, rawPreset);
    const allowed =
      availableCriteria && availableCriteria.length > 0
        ? availableCategoryUseCasePresets(categorySlug, availableCriteria).some(
            (p) => p.id === preset.id
          )
        : true;
    const effectivePreset = allowed
      ? preset
      : getRatingUseCasePresets(categorySlug)[0]!;
    const normalized = normalizeCategoryWeights(
      categorySlug,
      effectivePreset.weights,
      availableCriteria
    );
    return {
      mode: effectivePreset.id,
      weights: normalized.sliderWeights,
      normalizedPercent: normalized.normalizedPercent,
    };
  }

  const defNorm = normalizeCategoryWeights(
    categorySlug,
    defaultCategoryWeights(categorySlug),
    availableCriteria
  );
  return {
    mode: 'default',
    weights: defNorm.sliderWeights,
    normalizedPercent: defNorm.normalizedPercent,
  };
}

/**
 * Merges `preset` or `weights` into an existing query string (`window.location.search`),
 * removing both when Balanced Default is active so default URLs stay clean.
 */
export function mergeUseCaseQueryIntoSearch(
  currentSearch: string,
  categorySlug: string | null | undefined,
  mode: ActiveWeightMode,
  weights: unknown,
  availableCriteria?: readonly RatingCriterionKey[]
): string {
  const cleanSearch = currentSearch.startsWith('?')
    ? currentSearch.slice(1)
    : currentSearch;
  const params = new URLSearchParams(cleanSearch);
  params.delete('preset');
  params.delete('weights');

  if (
    !isDefaultCategoryWeights(categorySlug, mode, weights, availableCriteria)
  ) {
    if (mode === 'custom') {
      const encoded = serializeWeightsParam(
        categorySlug,
        weights,
        availableCriteria
      );
      if (encoded) params.set('weights', encoded);
    } else {
      params.set('preset', mode);
    }
  }

  const next = params.toString();
  return next ? `?${next}` : '';
}

function toSafePositiveNumber(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }
  if (typeof raw === 'string') {
    if (/\p{Cc}/u.test(raw)) return 0;
    const cleaned = raw.trim();
    if (!cleaned || cleaned.length > 32 || HEX_BIN_OCT_RE.test(cleaned)) {
      return 0;
    }
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

function legacyAliasesForCriterion(
  categorySlug: string,
  key: RatingCriterionKey
): readonly string[] {
  switch (key) {
    case 'display':
      return categorySlug === 'earbuds' ? [] : ['screen', 'man_hinh'];
    case 'sound':
      return categorySlug === 'earbuds'
        ? ['screen', 'audio', 'multimedia']
        : ['audio', 'multimedia'];
    case 'anc':
      return categorySlug === 'earbuds' ? ['camera'] : [];
    case 'health':
      return categorySlug === 'smartwatches' ? ['sensors'] : [];
    case 'apps':
      return categorySlug === 'smartwatches' ? ['connectivity'] : [];
    case 'performance':
      return ['hardware', 'hieu_nang'];
    case 'battery':
      return ['pin', 'endurance'];
    case 'value':
      return ['price_value', 'dang_tien'];
    default:
      return [];
  }
}

function legacyBreakdownFallback(
  categorySlug: string,
  key: RatingCriterionKey,
  breakdown: LeaderboardCriteriaBreakdown | null | undefined
): number | null {
  if (!breakdown || !isPlainObject(breakdown)) return null;
  let candidate: unknown;
  if (key === 'display' && categorySlug !== 'earbuds') {
    candidate = breakdown.screen;
  } else if (key === 'sound' && categorySlug === 'earbuds') {
    candidate = breakdown.screen;
  } else if (key === 'anc' && categorySlug === 'earbuds') {
    candidate = breakdown.camera;
  } else if (
    key === 'performance' &&
    (categorySlug === 'smartphones' ||
      categorySlug === 'tablets' ||
      categorySlug === 'laptops')
  ) {
    candidate = breakdown.performance;
  } else if (key === 'camera' && categorySlug === 'smartphones') {
    candidate = breakdown.camera;
  } else if (key === 'battery') {
    candidate = breakdown.battery;
  } else if (key === 'value') {
    candidate = breakdown.value;
  }
  const n = toSafePositiveNumber(candidate);
  return n > 0 && n <= 5 ? n : null;
}

/**
 * Extracts a product's real per-criterion scores (`0..5`) for `categorySlug`
 * without ever fabricating missing criteria from overall ratings, specs, or prices
 * (`#1143`, `#1531 D9`).
 */
export function extractCategoryCriteriaScores(
  product: Partial<MasterProduct> | null | undefined,
  categorySlug?: string | null,
  minWriters: number = CRITERION_RANK_WRITERS,
  fallbackBreakdown?: LeaderboardCriteriaBreakdown | null
): Record<RatingCriterionKey, number | null> {
  const safeProduct = isPlainObject(product) ? product : {};
  const effectiveMinWriters = Math.max(
    1,
    Number.isFinite(minWriters) ? minWriters : CRITERION_RANK_WRITERS
  );
  const resolvedCat =
    typeof categorySlug === 'string' && categorySlug.trim()
      ? normalizeCategorySlugInput(categorySlug)
      : normalizeCategorySlugInput(
          getMasterProductCategorySlug(safeProduct as MasterProduct)
        );
  const community = isPlainObject(safeProduct.criteria_scores)
    ? safeProduct.criteria_scores
    : {};
  const expert = isPlainObject(safeProduct.expert_criteria_scores)
    ? safeProduct.expert_criteria_scores
    : {};

  const readCommunity = (k: string): number | null => {
    const entry = ownValue(community, k);
    if (!isPlainObject(entry)) return null;
    const writers = toSafePositiveNumber(ownValue(entry, 'writers'));
    const score = toSafePositiveNumber(ownValue(entry, 'score'));
    return writers >= effectiveMinWriters && score > 0 && score <= 5
      ? score
      : null;
  };

  const readExpert = (k: string): number | null => {
    const v = toSafePositiveNumber(ownValue(expert, k));
    if (v > 0 && v <= 10) {
      return roundScore(Math.min(5, v > 5 ? v / 2 : v), 2);
    }
    return null;
  };

  const out = {} as Record<RatingCriterionKey, number | null>;
  for (const criterion of getRatingCriteria(resolvedCat)) {
    const keysToTry = [
      criterion.key,
      ...legacyAliasesForCriterion(resolvedCat, criterion.key),
    ];
    let resolvedScore: number | null = null;
    for (const k of keysToTry) {
      const comm = readCommunity(k);
      if (comm !== null) {
        resolvedScore = comm;
        break;
      }
    }
    if (resolvedScore === null) {
      for (const k of keysToTry) {
        const exp = readExpert(k);
        if (exp !== null) {
          resolvedScore = exp;
          break;
        }
      }
    }
    if (resolvedScore === null && fallbackBreakdown) {
      resolvedScore = legacyBreakdownFallback(
        resolvedCat,
        criterion.key,
        fallbackBreakdown
      );
    }
    setSafeKey(out, criterion.key, resolvedScore);
  }
  return out;
}

/**
 * Returns the category's criteria for which at least one product in `items`
 * has a real criterion score (`> 0`).
 */
export function scoredCategoryCriteriaForProducts(
  categorySlug: string | null | undefined,
  items: ReadonlyArray<{
    readonly product?: Partial<MasterProduct> | null;
    readonly rankCriteria?: LeaderboardCriteriaBreakdown | null;
  }>,
  minWriters: number = CRITERION_RANK_WRITERS
): RatingCriterionKey[] {
  const cat = normalizeCategorySlugInput(categorySlug);
  const criteria = getRatingCriteria(cat);
  const scored = new Set<RatingCriterionKey>();
  for (const entry of items) {
    if (!entry) continue;
    const map = extractCategoryCriteriaScores(
      entry.product,
      cat,
      minWriters,
      entry.rankCriteria
    );
    for (const c of criteria) {
      const val = map[c.key];
      if (typeof val === 'number' && val > 0) {
        scored.add(c.key);
      }
    }
    if (scored.size === criteria.length) break;
  }
  return criteria.map((c) => c.key).filter((k) => scored.has(k));
}

/**
 * Returns the category's criteria that BOTH sides of a 1v1 pair have a real
 * criterion score for (`#1556`).
 */
export function sharedCategoryCriteriaForPair(
  categorySlug: string | null | undefined,
  scoresA: CategoryCriteriaScores,
  scoresB: CategoryCriteriaScores
): RatingCriterionKey[] {
  return getRatingCriteria(normalizeCategorySlugInput(categorySlug))
    .map((c) => c.key)
    .filter((k) => (scoresA?.[k] ?? 0) > 0 && (scoresB?.[k] ?? 0) > 0);
}

/**
 * Computes `Your Custom Score` (`0..5`, decimal-safe 2 decimals matching
 * `weightedCriteriaScore5`) alongside the unchanged official `Rate.vn Score`
 * (`#1531 D3/D9`).
 *
 * Unrated criteria (`null`) are never fabricated: weights renormalize over
 * rated criteria, or `customScore5` is `null` when none of the weighted
 * criteria has a real score.
 */
export function computeCustomWeightedScore5(
  categorySlug: string | null | undefined,
  criteriaScores: CategoryCriteriaScores | null | undefined,
  rawWeights: unknown,
  options?: {
    readonly onlyCriteria?: readonly RatingCriterionKey[];
    readonly officialScore5?: number;
    readonly product?: Partial<MasterProduct> | null;
  }
): CustomWeightedScoreResult {
  const cat = normalizeCategorySlugInput(categorySlug);
  const criteria = getRatingCriteria(cat);
  const allowedSet =
    options?.onlyCriteria !== undefined
      ? new Set<RatingCriterionKey>(options.onlyCriteria)
      : null;
  const candidateCriteria: readonly RatingCriterion[] = allowedSet
    ? criteria.filter((c) => allowedSet.has(c.key))
    : criteria;

  const rawOfficial =
    options?.officialScore5 !== undefined
      ? options.officialScore5
      : options?.product
        ? resolveCompareEffectiveUserRating(options.product as MasterProduct)
        : 0;
  const officialScore5 =
    typeof rawOfficial === 'number' &&
    Number.isFinite(rawOfficial) &&
    rawOfficial > 0
      ? Math.min(5, rawOfficial)
      : 0;
  const displayedOfficialScore5 = displayedScore5(officialScore5);

  if (candidateCriteria.length === 0 || !isPlainObject(rawWeights)) {
    return {
      customScore5: null,
      displayedCustomScore5: null,
      officialScore5,
      displayedOfficialScore5,
      ratedCriteriaCount: 0,
      totalCriteriaCount: candidateCriteria.length,
      effectiveSharesPercent: {},
    };
  }

  const candidateKeys = candidateCriteria.map((c) => c.key);
  const normalized = normalizeCategoryWeights(cat, rawWeights, candidateKeys);
  if (normalized.wasAllZeroReset) {
    return {
      customScore5: null,
      displayedCustomScore5: null,
      officialScore5,
      displayedOfficialScore5,
      ratedCriteriaCount: 0,
      totalCriteriaCount: candidateCriteria.length,
      effectiveSharesPercent: {},
    };
  }

  const safeScores = isPlainObject(criteriaScores) ? criteriaScores : {};

  let weightedSum = 0;
  let weightSum = 0;
  const contributingKeys: RatingCriterionKey[] = [];
  const contributingWeights: Record<string, number> = {};

  for (const criterion of candidateCriteria) {
    const rawScore = ownValue(safeScores, criterion.key);
    const weight = normalized.sliderWeights[criterion.key] ?? 0;
    if (
      typeof rawScore !== 'number' ||
      !Number.isFinite(rawScore) ||
      rawScore <= 0 ||
      rawScore > 5 ||
      weight <= 0
    ) {
      continue;
    }
    weightedSum += rawScore * weight;
    weightSum += weight;
    contributingKeys.push(criterion.key);
    contributingWeights[criterion.key] = weight;
  }

  if (weightSum <= 0) {
    return {
      customScore5: null,
      displayedCustomScore5: null,
      officialScore5,
      displayedOfficialScore5,
      ratedCriteriaCount: 0,
      totalCriteriaCount: candidateCriteria.length,
      effectiveSharesPercent: {},
    };
  }

  const customScore5 = Math.min(5, roundScore(weightedSum / weightSum, 2));
  const displayedCustomScore5 = displayedScore5(customScore5);
  const effectiveSharesPercent = largestRemainderPercent(
    contributingKeys,
    contributingWeights
  );

  return {
    customScore5,
    displayedCustomScore5,
    officialScore5,
    displayedOfficialScore5,
    ratedCriteriaCount: contributingKeys.length,
    totalCriteriaCount: candidateCriteria.length,
    effectiveSharesPercent,
  };
}

/**
 * Formats a concise localized weight breakdown summary
 * (e.g. `Hiệu năng 40% · Pin và sạc 25% · Màn hình 15% ...`).
 */
export function formatNormalizedWeightSummary(
  categorySlug: string | null | undefined,
  normalizedPercent: Readonly<Partial<Record<RatingCriterionKey, number>>>,
  locale: string | null | undefined,
  criterionLabels?: Readonly<Partial<Record<RatingCriterionKey, string>>>,
  availableCriteria?: readonly RatingCriterionKey[]
): string {
  const cat = normalizeCategorySlugInput(categorySlug);
  const allowed =
    availableCriteria && availableCriteria.length > 0
      ? new Set<RatingCriterionKey>(availableCriteria)
      : null;
  const parts: string[] = [];
  for (const criterion of getRatingCriteria(cat)) {
    if (allowed && !allowed.has(criterion.key)) continue;
    const pct = normalizedPercent[criterion.key] ?? 0;
    if (pct <= 0) continue;
    const label =
      (criterionLabels &&
      Object.prototype.hasOwnProperty.call(criterionLabels, criterion.key)
        ? criterionLabels[criterion.key]
        : undefined) || getRatingCriterionLabel(criterion, locale);
    parts.push(`${label} ${formatPercent(pct, locale)}`);
  }
  return parts.join(' · ');
}

export function resolveLocalizedPresetName(
  categorySlug: string | null | undefined,
  mode: ActiveWeightMode,
  locale: string | null | undefined,
  presetLabels?: Readonly<Partial<Record<UseCasePresetId, string>>>,
  customLabel = 'Custom'
): string {
  if (mode === 'custom') return customLabel;
  if (
    presetLabels &&
    Object.prototype.hasOwnProperty.call(presetLabels, mode)
  ) {
    const fromCopy = presetLabels[mode];
    if (typeof fromCopy === 'string' && fromCopy.trim()) return fromCopy;
  }
  const preset = resolveCategoryPreset(categorySlug, mode);
  return getRatingUseCasePresetLabel(preset, locale);
}

/**
 * Bridges category criterion weights onto the 5 legacy `LeaderboardCriteriaWeights`
 * buckets (`screen`, `performance`, `camera`, `battery`, `value`) used by
 * `computeVersusResult` and legacy exports.
 */
export function toLegacyCriteriaWeights(
  categorySlug: string | null | undefined,
  rawWeights: unknown,
  availableCriteria?: readonly RatingCriterionKey[]
): LeaderboardCriteriaWeights {
  const cat = normalizeCategorySlugInput(categorySlug);
  const norm = normalizeCategoryWeights(
    cat,
    rawWeights,
    availableCriteria
  ).normalizedPercent;
  if (cat === 'earbuds') {
    return {
      screen: 0,
      performance: (norm.comfort ?? 0) + (norm.calls ?? 0),
      camera: (norm.sound ?? 0) + (norm.anc ?? 0),
      battery: norm.battery ?? 0,
      value: norm.value ?? 0,
    };
  }
  if (cat === 'smartwatches') {
    return {
      screen: (norm.display ?? 0) + (norm.design ?? 0),
      performance: norm.apps ?? 0,
      camera: norm.health ?? 0,
      battery: norm.battery ?? 0,
      value: norm.value ?? 0,
    };
  }
  if (cat === 'laptops') {
    return {
      screen: (norm.display ?? 0) + (norm.design ?? 0) + (norm.keyboard ?? 0),
      performance: (norm.performance ?? 0) + (norm.thermals ?? 0),
      camera: 0,
      battery: norm.battery ?? 0,
      value: norm.value ?? 0,
    };
  }
  if (cat === 'tablets') {
    return {
      screen: (norm.display ?? 0) + (norm.design ?? 0),
      performance: (norm.performance ?? 0) + (norm.software ?? 0),
      camera: norm.sound ?? 0,
      battery: norm.battery ?? 0,
      value: norm.value ?? 0,
    };
  }
  return {
    screen: (norm.display ?? 0) + (norm.design ?? 0),
    performance: norm.performance ?? 0,
    camera: norm.camera ?? 0,
    battery: norm.battery ?? 0,
    value: norm.value ?? 0,
  };
}

/**
 * Maps an `ActiveWeightMode` onto `PersonaPresetKey` for `computeVersusResult`.
 */
export function toLegacyVersusPersona(
  mode: ActiveWeightMode
): PersonaPresetKey {
  switch (mode) {
    case 'default':
      return 'default';
    case 'camera':
    case 'audiophile':
    case 'commute_anc':
    case 'media':
      return 'photography';
    case 'gaming':
    case 'creator':
      return 'gaming';
    case 'endurance':
    case 'fitness':
      return 'endurance';
    case 'office':
    case 'study_work':
    case 'smart_daily':
      return 'business';
    case 'value':
      return 'value_hunter';
    default:
      return 'custom';
  }
}
