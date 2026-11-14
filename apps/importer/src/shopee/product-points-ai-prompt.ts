/**
 * Grounded AI rewording, cluster merging and verdict helper for product pros
 * and cons (DOS/Rate#1623, design #1531 section 5.2, D9).
 *
 * Plain functions only: no client, no network. Every AI rewrite is checked
 * against the cluster's counted review lines and falls back to the deterministic
 * cluster label when ungrounded.
 */
import {
  GENERAL_POINTS,
  POINT_AI_WEIGHT_SHARE,
  POINT_MIN_SUPPORT,
  POINT_MIN_WRITERS,
  POINT_SILENT_MS,
  POINT_WRITER_SHARE_CAP,
  PRODUCT_CRITERION_POINTS_MAX,
  PRODUCT_POINTS_MAX,
  REVIEW_POINT_MAX,
  REVIEW_POINT_MIN,
  decayedWeight,
  getRatingCriteria,
  hasContent,
  hasReviewScoreClaim,
  isEvasiveCon,
  pointTokens,
  storedPoint,
  type PointCluster,
  type PointKind,
  type PointLine,
} from '@repo/shared-data/rules';
import { sanitizeAiGeneratedText } from './logger.js';

const NEGATED_PREFIX = 'không_';
const DIGITS_RE = /\p{N}+/gu;
const REDACTED_MARKER_RE = /\[(?:link|phone)-removed\]/iu;
const SAFE_CONNECTIVE_TOKENS = new Set([
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
]);
const SAFE_PRO_POLISH_TOKENS = new Set(['ổn', 'định', 'bền']);

function extractNumbers(text: string): string[] {
  return text.normalize('NFKC').match(DIGITS_RE) ?? [];
}

function validateGroundedSentence(
  aiSentence: unknown,
  rawLines: readonly string[],
  kind: PointKind
): string | null {
  if (typeof aiSentence !== 'string' || REDACTED_MARKER_RE.test(aiSentence)) return null;
  const cleaned = storedPoint(sanitizeAiGeneratedText(aiSentence, 200));
  if (REDACTED_MARKER_RE.test(cleaned)) return null;
  const length = [...cleaned].length;
  if (length < REVIEW_POINT_MIN || length > REVIEW_POINT_MAX) return null;
  if (!hasContent(cleaned)) return null;
  if (kind === 'con' && isEvasiveCon(cleaned)) return null;
  if (hasReviewScoreClaim(cleaned)) return null;

  const aiTokens = pointTokens(cleaned);
  if (aiTokens.length === 0) return null;

  const rawTokenSet = new Set<string>();
  const rawDigits = new Set<string>();
  for (const line of rawLines) {
    for (const tok of pointTokens(line)) rawTokenSet.add(tok);
    for (const num of extractNumbers(line)) rawDigits.add(num);
  }
  if (rawTokenSet.size === 0) return null;

  // Every AI token must come from raw lines (or neutral connectives / safe pro polish),
  // preventing invented secondary claims or antonym swaps ("mát" for "nóng").
  const aiDistinct = [...new Set(aiTokens)];
  const shared = aiDistinct.filter(tok => rawTokenSet.has(tok)).length;
  const minShared = Math.min(2, rawTokenSet.size);
  if (shared < minShared || shared / aiDistinct.length < 0.6) return null;
  for (const tok of aiDistinct) {
    const allowed =
      rawTokenSet.has(tok) ||
      SAFE_CONNECTIVE_TOKENS.has(tok) ||
      (kind === 'pro' && SAFE_PRO_POLISH_TOKENS.has(tok));
    if (!allowed) return null;
  }

  // Reject polarity flip between `không_<w>` and `<w>`.
  for (const tok of aiDistinct) {
    if (tok.startsWith(NEGATED_PREFIX)) {
      if (!rawTokenSet.has(tok)) return null;
    } else if (rawTokenSet.has(`${NEGATED_PREFIX}${tok}`) && !rawTokenSet.has(tok)) {
      return null;
    }
  }

  // Reject any digit sequence not present in the cluster's raw lines.
  for (const num of extractNumbers(cleaned)) {
    if (!rawDigits.has(num)) return null;
  }

  return cleaned;
}

/**
 * Checks one AI-rewritten sentence against its cluster's raw lines. Falls back
 * to `rawClusterLabel` on empty/out-of-range length, filler/evasive con, score
 * claims, insufficient word overlap, `không_<w>` polarity flip, or invented digits.
 */
export function resolveGroundedClusterLabel(
  aiSentence: unknown,
  rawClusterLabel: string,
  rawLines: readonly string[],
  kind: PointKind
): string {
  const fallback = storedPoint(rawClusterLabel) || rawClusterLabel.trim();
  return validateGroundedSentence(aiSentence, rawLines, kind) ?? fallback;
}

export interface AiClusterRewrite {
  clusterKeys: readonly string[];
  sentence?: string | null;
}

export interface MergedAiProductPoints {
  shown: PointCluster[];
  byCriterion: Record<string, { pros: PointCluster[]; cons: PointCluster[] }>;
  summary: { pros: PointCluster[]; cons: PointCluster[] };
}

function clampDate(value: string | Date, now: Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime() > now.getTime() ? now : d;
}

function rankClusters(a: PointCluster, b: PointCluster): number {
  const ownA = Number(a.reviewerCount > a.aiReviewerCount);
  const ownB = Number(b.reviewerCount > b.aiReviewerCount);
  return (
    ownB - ownA ||
    b.support - a.support ||
    b.reviewerCount - a.reviewerCount ||
    Number(b.hasExpert) - Number(a.hasExpert) ||
    b.lastSeen.getTime() - a.lastSeen.getTime() ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

/**
 * Merges clusters of the same `(criterionKey, kind)` grouped by AI, deduplicates
 * each writer via `Math.max` decayed support, re-verifies D9 + freshness, applies
 * criterion/summary caps (preserving cons via separate pro/con slots), and
 * grounds every label against the cluster's raw lines.
 */
export function mergeAndSelectAiProductPoints(
  clusters: readonly PointCluster[],
  lines: readonly PointLine[],
  rewrites: readonly AiClusterRewrite[],
  now: Date
): MergedAiProductPoints {
  const visibleByKey = new Map(clusters.filter(c => c.visible).map(c => [c.key, c]));
  const lineById = new Map(lines.map(l => [l.id, l]));
  const claimed = new Set<string>();
  const groups: { members: PointCluster[]; sentence: unknown }[] = [];

  for (const item of rewrites) {
    const byBucket = new Map<string, PointCluster[]>();
    for (const key of item.clusterKeys ?? []) {
      if (claimed.has(key)) continue;
      const cluster = visibleByKey.get(key);
      if (!cluster) continue;
      claimed.add(key);
      const bucketKey = `${cluster.criterionKey ?? GENERAL_POINTS}:${cluster.kind}`;
      const list = byBucket.get(bucketKey) ?? [];
      list.push(cluster);
      byBucket.set(bucketKey, list);
    }
    const buckets = [...byBucket.values()].sort((a, b) => b.length - a.length);
    const hasClearMajority =
      buckets.length === 1 ||
      (buckets.length > 1 && buckets[0]!.length > (buckets[1]?.length ?? 0));
    buckets.forEach((members, idx) => {
      const candidateSentence = idx === 0 && hasClearMajority ? item.sentence : null;
      if (members.length > 1) {
        const memberInfos = members.map(m => {
          const toks = new Set<string>();
          const digits = new Set<string>();
          for (const id of m.lineIds) {
            const b = lineById.get(id)?.body;
            if (b) {
              for (const t of pointTokens(b)) toks.add(t);
              for (const n of extractNumbers(b)) digits.add(n);
            }
          }
          return { toks, digits };
        });
        let compatible = true;
        for (let i = 0; i < memberInfos.length && compatible; i += 1) {
          for (let j = i + 1; j < memberInfos.length; j += 1) {
            const a = memberInfos[i]!;
            const b = memberInfos[j]!;
            const negConflict =
              [...a.toks].some(
                t => t.startsWith(NEGATED_PREFIX) && b.toks.has(t.slice(NEGATED_PREFIX.length))
              ) ||
              [...b.toks].some(
                t => t.startsWith(NEGATED_PREFIX) && a.toks.has(t.slice(NEGATED_PREFIX.length))
              );
            const numConflict =
              (a.digits.size > 0 || b.digits.size > 0) &&
              (a.digits.size !== b.digits.size || ![...a.digits].every(d => b.digits.has(d)));
            if (negConflict || numConflict) {
              compatible = false;
              break;
            }
          }
        }
        const pooledBodies = members.flatMap(m =>
          m.lineIds.map(id => lineById.get(id)?.body ?? '').filter(Boolean)
        );
        const validated = compatible
          ? validateGroundedSentence(candidateSentence, pooledBodies, members[0]!.kind)
          : null;
        const vTokens = validated ? new Set(pointTokens(validated)) : null;
        const overlapsEveryMember =
          vTokens !== null &&
          memberInfos.every(
            info =>
              info.toks.size > 0 &&
              [...info.toks].filter(t => vTokens.has(t)).length >= Math.min(2, info.toks.size)
          );
        if (overlapsEveryMember) {
          groups.push({ members, sentence: validated });
        } else {
          for (const single of members) groups.push({ members: [single], sentence: null });
        }
      } else {
        groups.push({ members, sentence: candidateSentence });
      }
    });
  }
  for (const cluster of visibleByKey.values()) {
    if (!claimed.has(cluster.key)) groups.push({ members: [cluster], sentence: null });
  }

  const rebuilt: PointCluster[] = [];
  for (const { members, sentence } of groups) {
    const ordered = [...members].sort(rankClusters);
    const leader = ordered[0]!;
    const uniqueLineIds = [...new Set(ordered.flatMap(m => m.lineIds))];
    const writers = new Map<string, number>();
    const ownWords = new Set<string>();
    const rawBodies: string[] = [];
    let hasExpert = false;
    let firstSeen: Date | null = null;
    let lastSeen: Date | null = null;

    for (const id of uniqueLineIds) {
      const line = lineById.get(id);
      if (!line || !Number.isFinite(line.weight) || line.weight <= 0) continue;
      const writer = line.writerId.trim();
      const writtenAt = clampDate(line.writtenAt, now);
      if (!writer || !writtenAt) continue;
      const isAi = line.method === 'ai';
      if (!isAi) ownWords.add(writer);
      const decayed = decayedWeight(line.weight, writtenAt, now);
      const eff = isAi
        ? POINT_AI_WEIGHT_SHARE * Math.min(decayed, POINT_WRITER_SHARE_CAP)
        : decayed;
      writers.set(writer, Math.max(writers.get(writer) ?? 0, eff));
      if (line.isExpert && !isAi && now.getTime() - writtenAt.getTime() <= POINT_SILENT_MS) {
        hasExpert = true;
      }
      if (!firstSeen || writtenAt.getTime() < firstSeen.getTime()) firstSeen = writtenAt;
      if (!lastSeen || writtenAt.getTime() > lastSeen.getTime()) lastSeen = writtenAt;
      rawBodies.push(line.body);
    }
    if (!firstSeen || !lastSeen || writers.size === 0) continue;

    let rawSupport = 0;
    let shownSupport = 0;
    for (const w of writers.values()) {
      rawSupport += w;
      shownSupport += Math.min(w, POINT_WRITER_SHARE_CAP);
    }
    const fresh = now.getTime() - lastSeen.getTime() <= POINT_SILENT_MS;
    const passes =
      (writers.size >= POINT_MIN_WRITERS && shownSupport >= POINT_MIN_SUPPORT) || hasExpert;
    if (!passes || !fresh) continue;

    rebuilt.push({
      key: leader.key,
      criterionKey: leader.criterionKey,
      kind: leader.kind,
      label: resolveGroundedClusterLabel(sentence, leader.label, rawBodies, leader.kind),
      support: Math.round(rawSupport * 100) / 100,
      reviewerCount: writers.size,
      aiReviewerCount: writers.size - ownWords.size,
      hasExpert,
      firstSeen,
      lastSeen,
      lineIds: uniqueLineIds,
      visible: true,
    });
  }

  rebuilt.sort(rankClusters);
  const pickSides = (list: readonly PointCluster[], max: number) => ({
    pros: list.filter(c => c.kind === 'pro').slice(0, max),
    cons: list.filter(c => c.kind === 'con').slice(0, max),
  });
  const byCriterion: Record<string, { pros: PointCluster[]; cons: PointCluster[] }> = {};
  for (const key of new Set(rebuilt.map(c => c.criterionKey ?? GENERAL_POINTS))) {
    byCriterion[key] = pickSides(
      rebuilt.filter(c => (c.criterionKey ?? GENERAL_POINTS) === key),
      PRODUCT_CRITERION_POINTS_MAX
    );
  }
  const summary = pickSides(rebuilt, PRODUCT_POINTS_MAX);
  const shownMap = new Map<string, PointCluster>();
  for (const s of [...Object.values(byCriterion), summary]) {
    for (const c of [...s.pros, ...s.cons]) shownMap.set(c.key, c);
  }
  return { shown: [...shownMap.values()], byCriterion, summary };
}

function formatUtcDdMmYyyy(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Formats a grounded 1-2 sentence product verdict from kept pros/cons, always
 * carrying the `DD/MM/YYYY` update date and ending `"Tóm tắt từ <N> review"`.
 */
export function formatGroundedProductVerdict(input: {
  aiVerdict?: unknown;
  summary: { pros: readonly PointCluster[]; cons: readonly PointCluster[] };
  reviewCount: number;
  updatedAt: Date;
}): string | null {
  const { summary, reviewCount, updatedAt } = input;
  if (!Number.isInteger(reviewCount) || reviewCount <= 0) return null;
  const shownLabels = [...summary.pros, ...summary.cons].map(c => c.label).filter(Boolean);
  if (shownLabels.length === 0) return null;

  const dateStr = formatUtcDdMmYyyy(updatedAt);
  const footer = `Cập nhật ${dateStr} - Tóm tắt từ ${reviewCount} review`;

  const defaultLeadParts: string[] = [];
  if (summary.pros[0]) defaultLeadParts.push(`Điểm cộng: ${summary.pros[0].label}`);
  if (summary.cons[0]) defaultLeadParts.push(`Điểm trừ: ${summary.cons[0].label}`);
  const fallbackBody = `${defaultLeadParts.join('. ').replace(/\.+$/u, '')}.`;

  let body = fallbackBody;
  if (typeof input.aiVerdict === 'string' && !REDACTED_MARKER_RE.test(input.aiVerdict)) {
    const cleaned = sanitizeAiGeneratedText(input.aiVerdict, 320)
      .replace(/\s*(?:Cập nhật[^.]*?)?Tóm tắt từ\s+\d+\s+review\.?\s*$/iu, '')
      .trim();
    const len = [...cleaned].length;
    if (
      len >= 12 &&
      len <= 280 &&
      !REDACTED_MARKER_RE.test(cleaned) &&
      hasContent(cleaned) &&
      !hasReviewScoreClaim(cleaned)
    ) {
      const allowedTokens = new Set(shownLabels.flatMap(l => pointTokens(l)));
      const allowedDigits = new Set(shownLabels.flatMap(l => extractNumbers(l)));
      const vDistinct = [...new Set(pointTokens(cleaned))];
      const shared = vDistinct.filter(t => allowedTokens.has(t)).length;
      const hasOverlap =
        allowedTokens.size > 0 &&
        shared >= Math.min(2, allowedTokens.size) &&
        vDistinct.length > 0 &&
        shared / vDistinct.length >= 0.6 &&
        vDistinct.every(t => allowedTokens.has(t) || SAFE_CONNECTIVE_TOKENS.has(t));
      const badNegation = vDistinct.some(t =>
        t.startsWith(NEGATED_PREFIX)
          ? !allowedTokens.has(t)
          : allowedTokens.has(`${NEGATED_PREFIX}${t}`) && !allowedTokens.has(t)
      );
      const badDigits = extractNumbers(cleaned).some(n => !allowedDigits.has(n));
      if (hasOverlap && !badNegation && !badDigits) {
        body = /[.!?]$/u.test(cleaned) ? cleaned : `${cleaned}.`;
      }
    }
  }

  return `${body} ${footer}`;
}

export const PRODUCT_POINTS_AI_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'product_points_rewording',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['groups', 'verdict'],
      properties: {
        groups: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['cluster_keys', 'sentence'],
            properties: {
              cluster_keys: { type: 'array', items: { type: 'string' } },
              sentence: { type: 'string' },
            },
          },
        },
        verdict: { type: 'string' },
      },
    },
  },
} as const;

export function buildProductPointsAiMessages(
  categorySlug: string | null | undefined,
  clusters: readonly PointCluster[],
  linesById: ReadonlyMap<string, PointLine>
): [{ role: 'system'; content: string }, { role: 'user'; content: string }] {
  const criteria = getRatingCriteria(categorySlug).map(c => `${c.key}: ${c.label.vi}`);
  const payload = clusters
    .filter(c => c.visible)
    .map(c => ({
      key: c.key,
      criterion: c.criterionKey ?? 'general',
      kind: c.kind,
      label: c.label,
      samples: c.lineIds
        .slice(0, 5)
        .map(id => linesById.get(id)?.body ?? '')
        .filter(Boolean),
    }));
  return [
    {
      role: 'system',
      content:
        'Bạn biên tập lại các cụm ưu/nhược điểm sản phẩm từ câu chữ thật của người mua sang Tiếng Việt ngắn gọn (5-150 ký tự). ' +
        'Chỉ gộp các cụm cùng criterion và cùng kind khi nói cùng một ý. ' +
        'Tuyệt đối không bịa con số, không đảo ngược phủ định, không nhắc điểm sao/thang điểm, không viết câu né tránh cho nhược điểm. ' +
        'Viết thêm verdict 1-2 câu tóm tắt đúng các cụm đã giữ (không ghi ngày hay số lượng review). Trả về JSON theo schema.',
    },
    {
      role: 'user',
      content: JSON.stringify({ criteria, clusters: payload }),
    },
  ];
}

export function parseProductPointsAiResponse(raw: string): {
  rewrites: AiClusterRewrite[];
  verdict: string | null;
} {
  const parsed = JSON.parse(raw) as {
    groups?: { cluster_keys?: unknown; sentence?: unknown }[];
    verdict?: unknown;
  };
  const rewrites: AiClusterRewrite[] = Array.isArray(parsed?.groups)
    ? parsed.groups.map(g => ({
        clusterKeys: Array.isArray(g?.cluster_keys)
          ? g.cluster_keys.filter((k): k is string => typeof k === 'string')
          : [],
        sentence: typeof g?.sentence === 'string' ? g.sentence : null,
      }))
    : [];
  return {
    rewrites,
    verdict: typeof parsed?.verdict === 'string' ? parsed.verdict : null,
  };
}
