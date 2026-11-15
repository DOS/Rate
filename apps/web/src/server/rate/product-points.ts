import 'server-only';
import { cache } from 'react';
import {
  POINT_AI_WEIGHT_SHARE,
  POINT_CLUSTER_OVERLAP,
  POINT_WRITER_SHARE_CAP,
  REVIEW_POINT_MAX,
  REVIEW_POINT_MIN,
  assignPointCriterion,
  comparablePoint,
  decayedWeight,
  hasContent,
  isEvasiveCon,
  pointTokens,
  wordOverlap,
} from '@repo/shared-data/rules';
import { fetchAllRows, getRateClient } from '../../lib/rate-api';
import {
  eligiblePointReviewWeight,
  isPointLineBeforeCutoff,
  normalizePointCriterionKey,
  preferProductPointsMethod,
  type PointEligibleReviewCandidate,
  type StoredProductPointRow,
} from '../../lib/product-points-display';
import {
  RATE_CACHE_TAGS,
  masterReviewsCacheTag,
  productCacheTag,
  withRateDataCache,
} from './cache-tags';

export interface MasterProductPointsData {
  rows: StoredProductPointRow[];
  /** Distinct eligible reviews in `rate.review_points` counted up to `updated_at`. */
  reviewCount: number;
}

const MASTER_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_PRODUCT_SLUG_REGEX = /^[a-z0-9._-]{1,120}$/;
const SAFE_CATEGORY_SLUG_REGEX = /^[a-z_-]{2,64}$/;
const DISALLOWED_SLUG_TOKEN_REGEX =
  /^(?:null|undefined|nan|none|infinity|-infinity|true|false|__proto__|constructor|prototype)$/i;

function sanitizeMasterUuid(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  return MASTER_UUID_REGEX.test(cleaned) &&
    !/^0+$/.test(cleaned.replace(/-/g, ''))
    ? cleaned
    : '';
}

function sanitizeSlugTag(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  if (
    !SAFE_PRODUCT_SLUG_REGEX.test(cleaned) ||
    !/[a-z0-9]/.test(cleaned) ||
    /^0+$/.test(cleaned) ||
    cleaned.startsWith('.') ||
    cleaned.endsWith('.') ||
    cleaned.includes('..') ||
    DISALLOWED_SLUG_TOKEN_REGEX.test(cleaned)
  ) {
    return '';
  }
  return cleaned;
}

function sanitizeCategorySlug(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  return SAFE_CATEGORY_SLUG_REGEX.test(cleaned) &&
    !DISALLOWED_SLUG_TOKEN_REGEX.test(cleaned)
    ? cleaned
    : '';
}

const PRODUCT_POINTS_SELECT =
  'id, master_id, criterion_key, kind, label, support, reviewer_count, has_expert, first_seen, last_seen, method, updated_at';

const COUNTED_POINT_REVIEWS_SELECT =
  'id, reviewer_type, helpfulness_weight, created_at, platform_created_at, products!inner(cluster_id, origin), review_points!inner(id, kind, criterion_key, body, method, created_at), review_flags(include_in_rating, verdict)';

function latestPointUpdate(rows: readonly StoredProductPointRow[]): {
  ms: number;
  iso: string | null;
} {
  let latestMs = 0;
  let latestIso: string | null = null;
  for (const row of rows) {
    if (typeof row.updated_at !== 'string' || !row.updated_at.trim()) continue;
    const ms = Date.parse(row.updated_at);
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latestIso = row.updated_at.trim();
    }
  }
  return { ms: latestMs, iso: latestIso };
}

function parseMs(raw: string | undefined): number {
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

const NEGATED_PREFIX = 'không_';
const DIGITS_RE = /\p{N}+/gu;
const ASPECT_WORDS = new Set([
  'pin',
  'sạc',
  'mah',
  'màn',
  'nit',
  'chói',
  'camera',
  'chụp',
  'quay',
  'selfie',
  'zoom',
  'mượt',
  'lag',
  'giật',
  'chip',
  'game',
  'ram',
  'bền',
  'nhẹ',
  'nặng',
  'vỏ',
  'khung',
  'mỏng',
  'giá',
  'tiền',
  'rẻ',
  'đắt',
  'hời',
  'loa',
  'bass',
  'treble',
  'ios',
  'android',
  'phím',
  'touchpad',
  'trackpad',
  'nóng',
  'nhiệt',
  'quạt',
  'ồn',
  'spo2',
  'ngủ',
  'app',
  'bluetooth',
  'wifi',
  'gps',
  'nfc',
  'anc',
  'đeo',
  'cấn',
  'mic',
  'micro',
  'gọi',
  'sạch',
  'ngon',
  'nhanh',
  'chậm',
  'đợi',
  'lâu',
]);

interface CountedWriterLine {
  kind: 'pro' | 'con';
  criterionKey: string | null;
  comp: string;
  tokens: string[];
  tokenSet: Set<string>;
  digits: Set<string>;
  writtenAtMs: number;
  decayedSupport: number;
}

interface PreparedRowCandidate {
  index: number;
  method: 'ai' | 'code';
  comp: string;
  tokens: string[];
  tokenSet: Set<string>;
  digits: Set<string>;
  support: number;
  firstMs: number;
  lastMs: number;
}

function extractDigitSet(text: string): Set<string> {
  return new Set(text.normalize('NFKC').match(DIGITS_RE) ?? []);
}

function sameStringSet(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>
): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

const SAFE_AI_POLISH_TOKENS = new Set([
  'nhưng',
  'tuy',
  'nhiên',
  'và',
  'với',
  'khi',
  'lúc',
  'vẫn',
  'còn',
  'hơn',
  'nên',
  'vì',
  'do',
  'ở',
  'trên',
  'cho',
  'điểm',
  'cộng',
  'trừ',
  'ổn',
  'định',
  'bền',
]);

function hasClaimConflict(
  method: 'ai' | 'code',
  rowTokens: readonly string[],
  rowTokenSet: ReadonlySet<string>,
  rowDigits: ReadonlySet<string>,
  lineTokens: readonly string[],
  lineTokenSet: ReadonlySet<string>,
  lineDigits: ReadonlySet<string>
): boolean {
  if (method === 'code') {
    if (!sameStringSet(rowDigits, lineDigits)) return true;
  } else {
    for (const d of rowDigits) {
      if (!lineDigits.has(d)) return true;
    }
    if (rowDigits.size === 0 && lineDigits.size > 0) {
      for (const tok of rowTokenSet) {
        if (!lineTokenSet.has(tok) && !SAFE_AI_POLISH_TOKENS.has(tok)) {
          return true;
        }
      }
    }
  }
  for (const tok of rowTokens) {
    if (
      tok.startsWith(NEGATED_PREFIX) &&
      lineTokenSet.has(tok.slice(NEGATED_PREFIX.length))
    ) {
      return true;
    }
  }
  for (const tok of lineTokens) {
    if (
      tok.startsWith(NEGATED_PREFIX) &&
      rowTokenSet.has(tok.slice(NEGATED_PREFIX.length))
    ) {
      return true;
    }
  }
  let rowOnlyAspect = false;
  for (const tok of rowTokenSet) {
    if (ASPECT_WORDS.has(tok) && !lineTokenSet.has(tok)) {
      rowOnlyAspect = true;
      break;
    }
  }
  if (!rowOnlyAspect) return false;
  for (const tok of lineTokenSet) {
    if (ASPECT_WORDS.has(tok) && !rowTokenSet.has(tok)) {
      return true;
    }
  }
  return false;
}

function scoreWriterLineAgainstRow(
  w: CountedWriterLine,
  cand: PreparedRowCandidate
): number {
  if (cand.firstMs > 0 && w.writtenAtMs < cand.firstMs - 1_000) return 0;
  if (cand.lastMs > 0 && w.writtenAtMs > cand.lastMs + 1_000) return 0;
  if (w.decayedSupport - cand.support > 0.02) return 0;
  if (cand.comp && cand.comp === w.comp) return 2;
  if (
    w.tokenSet.size === 0 ||
    cand.tokenSet.size === 0 ||
    hasClaimConflict(
      cand.method,
      cand.tokens,
      cand.tokenSet,
      cand.digits,
      w.tokens,
      w.tokenSet,
      w.digits
    )
  ) {
    return 0;
  }
  let shared = 0;
  for (const tok of w.tokenSet) {
    if (cand.tokenSet.has(tok)) shared += 1;
  }
  if (shared < Math.min(2, w.tokenSet.size)) return 0;
  const dice = wordOverlap(cand.tokens, w.tokens);
  if (w.tokenSet.size < 2 && dice < POINT_CLUSTER_OVERLAP) return 0;
  const [shorter, longer] =
    w.tokenSet.size <= cand.tokenSet.size
      ? [w.tokenSet, cand.tokenSet]
      : [cand.tokenSet, w.tokenSet];
  let contained = shorter.size >= 2;
  if (contained) {
    for (const tok of shorter) {
      if (!longer.has(tok)) {
        contained = false;
        break;
      }
    }
  }
  if (cand.method === 'code') {
    const eff = contained ? Math.max(dice, POINT_CLUSTER_OVERLAP) : dice;
    return eff >= POINT_CLUSTER_OVERLAP ? eff : 0;
  }
  const coverage = Math.max(
    shared / w.tokenSet.size,
    contained ? POINT_CLUSTER_OVERLAP : 0
  );
  return coverage >= POINT_CLUSTER_OVERLAP ? dice * 0.5 + coverage * 0.5 : 0;
}

function isProvablyOwnWordsRow(row: StoredProductPointRow): boolean {
  const reviewerCount = Math.max(
    0,
    Math.trunc(Number(row.reviewer_count) || 0)
  );
  const support = Number(row.support) || 0;
  const aiCeiling =
    POINT_AI_WEIGHT_SHARE * POINT_WRITER_SHARE_CAP * reviewerCount + 1e-6;
  return Boolean(row.has_expert) || support > aiCeiling;
}

function parseCountedPointTokens(
  kind: string | null | undefined,
  rawBody: unknown
): { body: string; tokens: string[] } | null {
  if (kind !== 'pro' && kind !== 'con') return null;
  if (typeof rawBody !== 'string') return null;
  const body = rawBody.trim();
  const length = [...body.normalize('NFKC')].length;
  if (length < REVIEW_POINT_MIN || length > REVIEW_POINT_MAX) return null;
  if (!hasContent(body)) return null;
  if (kind === 'con' && isEvasiveCon(body)) return null;
  const tokens = pointTokens(body);
  return tokens.length > 0 ? { body, tokens } : null;
}

function annotateOwnWordsFromWriterLines(
  rows: readonly StoredProductPointRow[],
  writerLines: readonly CountedWriterLine[],
  categorySlug: string | null
): StoredProductPointRow[] {
  const ownFlags = rows.map(isProvablyOwnWordsRow);
  if (writerLines.length === 0 || ownFlags.every(Boolean)) {
    return rows.map((row, idx) => ({ ...row, has_own_words: ownFlags[idx] }));
  }

  const buckets = new Map<string, PreparedRowCandidate[]>();
  rows.forEach((row, idx) => {
    if (ownFlags[idx]) return;
    const kind = row.kind === 'con' ? 'con' : 'pro';
    const criterionKey = normalizePointCriterionKey(
      row.criterion_key,
      categorySlug
    );
    const bucketKey = `${criterionKey ?? ''}:${kind}`;
    const tokens = pointTokens(row.label);
    const cand: PreparedRowCandidate = {
      index: idx,
      method: row.method === 'ai' ? 'ai' : 'code',
      comp: comparablePoint(row.label),
      tokens,
      tokenSet: new Set(tokens),
      digits: extractDigitSet(row.label),
      support: Number(row.support) || 0,
      firstMs: parseMs(row.first_seen),
      lastMs: parseMs(row.last_seen),
    };
    const list = buckets.get(bucketKey);
    if (list) list.push(cand);
    else buckets.set(bucketKey, [cand]);
  });

  for (const w of writerLines) {
    const candidates = buckets.get(`${w.criterionKey ?? ''}:${w.kind}`);
    if (!candidates || candidates.length === 0) continue;
    let best: PreparedRowCandidate | null = null;
    let bestScore = 0;
    let bestTimeDiff = Number.POSITIVE_INFINITY;
    for (const cand of candidates) {
      const score = scoreWriterLineAgainstRow(w, cand);
      if (score <= 0) continue;
      const timeDiff =
        cand.lastMs > 0 ? Math.abs(cand.lastMs - w.writtenAtMs) : 0;
      if (
        score > bestScore + 1e-9 ||
        (Math.abs(score - bestScore) <= 1e-9 && timeDiff < bestTimeDiff)
      ) {
        best = cand;
        bestScore = score;
        bestTimeDiff = timeDiff;
      }
    }
    if (best) {
      ownFlags[best.index] = true;
    }
  }

  return rows.map((row, idx) => ({ ...row, has_own_words: ownFlags[idx] }));
}

/**
 * Reads `rate.product_points` (and, when non-empty, counts the distinct eligible
 * `rate.review_points` reviews and resolves writer-authored cluster priority up
 * to `updated_at`) for one master product via the public anon client
 * (DOS/Rate#1624). Prefers `method = 'ai'` rows when the master has any valid
 * `ai` rows; otherwise falls back to `method = 'code'` rows. Throws
 * `RateDataUnavailableError` on database failure so Next.js Data Cache never
 * caches an empty outage response.
 */
export async function getMasterProductPoints(
  masterProductId: string,
  categorySlug?: string | null
): Promise<MasterProductPointsData> {
  const cleanId = sanitizeMasterUuid(masterProductId);
  if (!cleanId) return { rows: [], reviewCount: 0 };
  const cleanCat = sanitizeCategorySlug(categorySlug) || null;
  const supabase = getRateClient();
  const rawRows = await fetchAllRows<StoredProductPointRow>(
    `product_points for master ${cleanId}`,
    (from, to) =>
      supabase
        .from('product_points')
        .select(PRODUCT_POINTS_SELECT, { count: 'exact' })
        .eq('master_id', cleanId)
        .in('method', ['ai', 'code'])
        .order('support', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
  );
  const rows = preferProductPointsMethod(rawRows);
  if (rows.length === 0) {
    return { rows: [], reviewCount: 0 };
  }

  const { ms: latestUpdatedMs, iso: latestUpdatedIso } =
    latestPointUpdate(rows);
  const reviewRows = await fetchAllRows<PointEligibleReviewCandidate>(
    `product_points reviews for master ${cleanId}`,
    (from, to) => {
      let query = supabase
        .from('reviews')
        .select(COUNTED_POINT_REVIEWS_SELECT, { count: 'exact' })
        .eq('products.cluster_id', cleanId)
        .eq('products.origin', 'crawl')
        .in('origin', ['crawl', 'community'])
        .in('review_points.method', ['writer', 'ai'])
        .in('review_points.kind', ['pro', 'con']);
      if (latestUpdatedIso) {
        query = query.lte('review_points.created_at', latestUpdatedIso);
      }
      return query.order('id', { ascending: true }).range(from, to);
    }
  );

  const nowMs = latestUpdatedMs > 0 ? latestUpdatedMs : Date.now();
  const nowDate = new Date(nowMs);
  const needsWriterCheck = rows.some((r) => !isProvablyOwnWordsRow(r));
  const countedReviewIds = new Set<string>();
  const fallbackReviewIds = new Set<string>();
  const seenLineIds = new Set<string>();
  const writerLines: CountedWriterLine[] = [];
  let sawReviewPointsArray = false;

  for (const rev of reviewRows) {
    const weight = eligiblePointReviewWeight(rev, latestUpdatedMs);
    if (weight <= 0) continue;
    fallbackReviewIds.add(rev.id);
    if (!Array.isArray(rev.review_points)) continue;
    sawReviewPointsArray = true;
    const rawWritten = rev.platform_created_at ?? rev.created_at ?? '';
    const parsedWrittenMs = Date.parse(rawWritten);
    if (!Number.isFinite(parsedWrittenMs)) continue;
    const writtenAtMs = parsedWrittenMs > nowMs ? nowMs : parsedWrittenMs;

    for (const [idx, pt] of rev.review_points.entries()) {
      if (!isPointLineBeforeCutoff(pt, latestUpdatedMs)) continue;
      const lineId =
        typeof pt.id === 'string' && pt.id.trim()
          ? pt.id.trim()
          : `${rev.id}:${idx}`;
      if (seenLineIds.has(lineId)) continue;
      seenLineIds.add(lineId);
      const isAi = pt.method === 'ai';
      if (isAi && countedReviewIds.has(rev.id)) continue;
      const parsed = parseCountedPointTokens(pt.kind, pt.body);
      if (!parsed) continue;
      countedReviewIds.add(rev.id);
      if (!isAi && needsWriterCheck) {
        writerLines.push({
          kind: pt.kind as 'pro' | 'con',
          criterionKey: assignPointCriterion(
            cleanCat,
            pt.criterion_key ?? null,
            parsed.body
          ),
          comp: comparablePoint(parsed.body),
          tokens: parsed.tokens,
          tokenSet: new Set(parsed.tokens),
          digits: extractDigitSet(parsed.body),
          writtenAtMs,
          decayedSupport: decayedWeight(weight, new Date(writtenAtMs), nowDate),
        });
      }
    }
  }

  return {
    rows: annotateOwnWordsFromWriterLines(rows, writerLines, cleanCat),
    reviewCount: sawReviewPointsArray
      ? countedReviewIds.size
      : fallbackReviewIds.size,
  };
}

const _getCachedMasterProductPointsByKey = cache(
  (cleanId: string, cleanSlug: string, cleanCat: string) =>
    withRateDataCache(
      getMasterProductPoints,
      [
        'rate-master-product-points',
        cleanId,
        ...(cleanSlug ? [cleanSlug] : []),
        ...(cleanCat ? [cleanCat] : []),
      ],
      {
        revalidate: 300,
        tags: [
          RATE_CACHE_TAGS.REVIEWS,
          RATE_CACHE_TAGS.PRODUCTS,
          masterReviewsCacheTag(cleanId),
          ...(cleanSlug ? [productCacheTag(cleanSlug)] : []),
        ],
      }
    )(cleanId, cleanCat || null)
);

/**
 * Server-cached `rate.product_points` reader deduplicated per render pass with
 * `React.cache()` and across requests with `withRateDataCache` (`revalidate: 300`).
 */
export function getCachedMasterProductPoints(
  masterProductId: string,
  productSlug?: string | null,
  categorySlug?: string | null
): Promise<MasterProductPointsData> {
  const cleanId = sanitizeMasterUuid(masterProductId);
  if (!cleanId) return Promise.resolve({ rows: [], reviewCount: 0 });
  const cleanSlug = sanitizeSlugTag(productSlug);
  const cleanCat = sanitizeCategorySlug(categorySlug);
  return _getCachedMasterProductPointsByKey(cleanId, cleanSlug, cleanCat);
}
