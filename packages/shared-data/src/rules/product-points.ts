/**
 * A product's pros and cons, built from its reviews' pro and con lines
 * (DOS/Rate#1546, design #1531 section 5.1, D9). Code only, no AI: lines are
 * normalised, given a criterion, clustered by shared words, counted once per
 * writer by trust weight, decayed by age and filtered for display. Lines AI
 * extracted from marketplace reviews count at half weight
 * (POINT_AI_WEIGHT_SHARE), so they can add to a point but one wrong
 * extraction never shows alone.
 *
 * Plain data and functions only, like the rest of `rules`, and no database:
 * the importer job reads `rate.review_points` into PointLine values and
 * writes the clusters to `rate.product_points`.
 */
import { getRatingCriteria } from './rating-criteria.js';
import {
  REVIEW_POINT_MAX,
  REVIEW_POINT_MIN,
  comparablePoint,
  hasContent,
  isEvasiveCon,
} from './review-form.js';

/** Two lines join a cluster when this share of their words is shared. */
export const POINT_CLUSTER_OVERLAP = 0.6;
/** D9: a point shows with this many distinct writers... */
export const POINT_MIN_WRITERS = 2;
/**
 * ...whose decayed weights, each writer counting at most
 * POINT_WRITER_SHARE_CAP, sum to at least this; or with one expert.
 */
export const POINT_MIN_SUPPORT = 1.5;
/**
 * The most one writer adds toward POINT_MIN_SUPPORT, so one heavy writer and
 * a near-zero one (3 + 0.01) are not two real voices. Ranking still uses the
 * full support.
 */
export const POINT_WRITER_SHARE_CAP = 1;
/** A writer's weight counts at most this, as in the product rating. */
export const POINT_WEIGHT_CAP = 3;
/**
 * A line AI extracted from a marketplace review (`method: 'ai'`) counts this
 * share of its writer's decayed weight, after the per-writer cap
 * (POINT_WRITER_SHARE_CAP): 0.5 x min(weight, 1). Its review still counts as
 * one writer, so a point from marketplace reviews alone needs three of them
 * to reach POINT_MIN_SUPPORT, and one wrong extraction never shows on its own
 * (DOS/Rate#1531, `2026-11-03-ai-review-points.html` section 9, D4 option b).
 */
export const POINT_AI_WEIGHT_SHARE = 0.5;
/** Pros and cons shown per criterion, each side. */
export const PRODUCT_CRITERION_POINTS_MAX = 3;
/** Pros and cons shown in the product summary, each side. */
export const PRODUCT_POINTS_MAX = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365.25 * DAY_MS;
/** A line's weight halves every 12 months (design 5.3). */
export const POINT_HALF_LIFE_MS = YEAR_MS;
/** A cluster nobody mentioned for 18 months is hidden (design 5.3). */
export const POINT_SILENT_MS = 1.5 * YEAR_MS;

export type PointKind = 'pro' | 'con';

/** One pro or con line of a review, as the importer reads it. */
export interface PointLine {
  /** `rate.review_points.id`. */
  id: string;
  reviewId: string;
  /** Who wrote it: a user id, or a marketplace reviewer key. */
  writerId: string;
  kind: PointKind;
  /** The line's own criterion, or null for a pro or con of the whole review. */
  criterionKey: string | null;
  body: string;
  /** The review's trust weight; 0 means the gate excluded it. */
  weight: number;
  /** A review Rate published as an expert's (reviewer_type = 'expert'). */
  isExpert: boolean;
  /** When the review was written (ISO string or Date). */
  writtenAt: string | Date;
  /**
   * `rate.review_points.method`: 'ai' for a line extracted by AI from a
   * marketplace review, which counts at POINT_AI_WEIGHT_SHARE and never as
   * an expert's; the writer's own lines otherwise.
   */
  method?: 'writer' | 'ai';
}

/** Options of aggregateProductPoints. */
export interface ProductPointsOptions {
  /**
   * Leave out every line AI extracted (`method: 'ai'`), as if none were
   * stored: the switch that hides them without deleting anything.
   */
  hideAiLines?: boolean;
}

/** A cluster of lines, as `rate.product_points` stores it. */
export interface PointCluster {
  /** Stable within one run: criterion, kind and the first line's id. */
  key: string;
  criterionKey: string | null;
  kind: PointKind;
  /** The line most writers wrote alike, in its writer's words. */
  label: string;
  /** Distinct writers' decayed, capped weights, at two decimals. */
  support: number;
  reviewerCount: number;
  /**
   * Of reviewerCount, the marketplace reviews counted only through lines AI
   * extracted ("trong đó N review trên sàn"). A point with a writer's own line
   * has reviewerCount > aiReviewerCount and ranks before AI-only points.
   */
  aiReviewerCount: number;
  hasExpert: boolean;
  firstSeen: Date;
  lastSeen: Date;
  /** Every counted line in the cluster, for `review_points.cluster_id`. */
  lineIds: string[];
  /** Whether it passes D9 and is not silent (design 5.3). */
  visible: boolean;
}

export interface PointSides {
  pros: PointCluster[];
  cons: PointCluster[];
}

export interface ProductPoints {
  /** Every cluster, shown or not, in display order. */
  clusters: PointCluster[];
  /** Shown points per criterion key; '' holds the whole-review ("Chung") ones. */
  byCriterion: Record<string, PointSides>;
  /** The product summary: up to five each side, a passing con always kept. */
  summary: PointSides;
  /** Distinct reviews whose lines were counted ("Tóm tắt từ N review"). */
  reviewCount: number;
  /** Of reviewCount, those counted only through AI lines ("trong đó N review trên sàn"). */
  aiReviewCount: number;
  /** The run's clock, shown as "Cập nhật ngày ...". */
  updatedAt: Date;
}

// The rules' import check reads quotes on an export line as a module path.
const EMPTY = '';
const SPACE = ' ';
/** The bucket of a whole-review point ("Chung"). */
export const GENERAL_POINTS = EMPTY;

// Intensifiers and particles that do not change what a line says
// ("pin khá trâu" is "pin trâu").
const FILLER = new Set([
  'khá',
  'rất',
  'hơi',
  'quá',
  'lắm',
  'cực',
  'siêu',
  'cũng',
  'thì',
  'là',
  'ạ',
  'nhé',
  'nha',
  'hề',
]);
const NEGATED = 'không_';
// A negation joins the next word, so "pin không trâu" never matches
// "pin trâu" by sharing "pin" and "trâu".
const NEGATION = new Set([
  'không',
  'ko',
  'k',
  'kh',
  'khum',
  'hok',
  'chưa',
  'chẳng',
  'chả',
]);

/** A word without diacritics, "đ" as "d". */
function plainWord(word: string): string {
  return word
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/g, 'd');
}

/**
 * The words two lines are compared by: the comparable line (diacritics
 * kept, design 5.1) without filler words, each negation joined to the word
 * after it ("không_trâu").
 */
export function pointTokens(text: string): string[] {
  const words = comparablePoint(text)
    .split(SPACE)
    .filter((word) => word && !FILLER.has(word));
  const tokens: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    if (NEGATION.has(word) && i + 1 < words.length) {
      tokens.push(`${NEGATED}${words[i + 1]}`);
      i += 1;
    } else tokens.push(NEGATION.has(word) ? 'không' : word);
  }
  return tokens;
}

/**
 * The share of words two lines have in common: twice the shared distinct
 * words over both lines' distinct words (the Dice coefficient), from 0 to 1.
 */
export function wordOverlap(
  a: readonly string[],
  b: readonly string[]
): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size + right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

// Keywords per criterion, written with diacritics. The analyzer's aspect
// words (battery, display, camera, audio, performance) are the start. A word
// whose plain form is a common word is left out: "đơ" and "đo" read "do"
// (because), "chờ" reads "cho", "êm" reads "em", "cầm" and "cam" read
// the colour, "mắc" reads "Mac".
const CRITERION_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  battery: ['pin', 'sạc', 'mah', 'sạc nhanh', 'thời lượng', 'củ sạc'],
  display: [
    'màn hình',
    'màn',
    'hiển thị',
    'độ sáng',
    'tần số quét',
    'nit',
    'ám màu',
    'chói',
  ],
  camera: [
    'camera',
    'chụp',
    'chụp ảnh',
    'quay',
    'quay phim',
    'selfie',
    'zoom',
    'góc rộng',
  ],
  performance: [
    'hiệu năng',
    'mượt',
    'lag',
    'giật',
    'chip',
    'game',
    'chơi game',
    'cấu hình',
    'ram',
    'xử lý',
  ],
  design: [
    'thiết kế',
    'bền',
    'nhẹ',
    'nặng',
    'vỏ',
    'khung',
    'mỏng',
    'chắc chắn',
    'chống nước',
    'ngoại hình',
  ],
  value: ['giá', 'tiền', 'đáng tiền', 'rẻ', 'đắt', 'hời'],
  sound: ['âm thanh', 'chất âm', 'loa', 'bass', 'treble', 'âm lượng'],
  software: ['phần mềm', 'ứng dụng', 'cập nhật', 'ios', 'android', 'giao diện'],
  keyboard: ['bàn phím', 'phím', 'touchpad', 'trackpad'],
  thermals: ['nóng', 'nhiệt', 'quạt', 'ồn', 'tản nhiệt'],
  health: [
    'sức khoẻ',
    'sức khỏe',
    'nhịp tim',
    'spo2',
    'giấc ngủ',
    'ngủ',
    'bước chân',
  ],
  apps: [
    'ứng dụng',
    'app',
    'kết nối',
    'thông báo',
    'bluetooth',
    'wifi',
    'gps',
    'nfc',
  ],
  anc: ['chống ồn', 'anc', 'xuyên âm', 'cách âm'],
  comfort: ['đeo', 'thoải mái', 'đau tai', 'vừa tai', 'cấn'],
  calls: ['mic', 'micro', 'gọi', 'cuộc gọi', 'đàm thoại', 'nghe gọi'],
  service_quality: ['chất lượng', 'dịch vụ', 'sạch', 'ngon'],
  price: ['giá', 'tiền', 'rẻ', 'đắt'],
  attitude: ['thái độ', 'nhân viên', 'phục vụ', 'nhiệt tình', 'lịch sự'],
  speed: ['nhanh', 'chậm', 'đợi', 'lâu'],
};

/**
 * Whether a keyword's words appear in a line's words, in order. A line typed
 * without any diacritics ("pin trau, sac nhanh") matches the plain keyword;
 * a line with diacritics matches only as written, so "cảm" (cảm ứng) is not
 * "cam" and "do" (because) is not "đo".
 */
function containsKeyword(
  words: readonly string[],
  keyword: string,
  plainLine: boolean
): boolean {
  const wanted = (plainLine ? plainWord(keyword) : keyword).split(SPACE);
  for (let start = 0; start + wanted.length <= words.length; start += 1) {
    if (wanted.every((want, offset) => words[start + offset] === want))
      return true;
  }
  return false;
}

/** Matched keywords, not counting one inside a longer match ("màn" in "màn hình"). */
function keywordHits(
  words: readonly string[],
  keywords: readonly string[],
  plainLine: boolean
): number {
  const matched = keywords.filter((kw) =>
    containsKeyword(words, kw, plainLine)
  );
  return matched.filter(
    (kw) =>
      !matched.some((other) => other !== kw && ` ${other} `.includes(` ${kw} `))
  ).length;
}

/**
 * The criterion a line belongs to in a category: its own key when the
 * category has it, otherwise the criterion whose keywords it mentions most
 * (ties go to the category's order), otherwise null ("Chung").
 */
export function assignPointCriterion(
  categorySlug: string | null | undefined,
  criterionKey: string | null,
  body: string
): string | null {
  const criteria = getRatingCriteria(categorySlug);
  if (criterionKey && criteria.some((cr) => cr.key === criterionKey))
    return criterionKey;
  const words = comparablePoint(body).split(SPACE);
  const plainLine = words.every((word) => word === plainWord(word));
  let best: string | null = null;
  let bestHits = 0;
  for (const criterion of criteria) {
    const keywords = Object.prototype.hasOwnProperty.call(
      CRITERION_KEYWORDS,
      criterion.key
    )
      ? CRITERION_KEYWORDS[criterion.key]!
      : [];
    const hits = keywordHits(words, keywords, plainLine);
    if (hits > bestHits) {
      best = criterion.key;
      bestHits = hits;
    }
  }
  return best;
}

/** A weight after decay: half per POINT_HALF_LIFE_MS of age, capped. */
export function decayedWeight(
  weight: number,
  writtenAt: Date,
  now: Date
): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  const age = Math.max(0, now.getTime() - writtenAt.getTime());
  return Math.min(weight, POINT_WEIGHT_CAP) * 0.5 ** (age / POINT_HALF_LIFE_MS);
}

interface Line {
  source: PointLine;
  /** The writer id, trimmed. */
  writer: string;
  criterionKey: string | null;
  tokens: string[];
  form: string;
  writtenAt: Date;
}

function asDate(value: string | Date | null | undefined): Date {
  if (value instanceof Date) return value;
  // new Date(null) is 1970, not an unknown date.
  return typeof value === 'string' ? new Date(value) : new Date(Number.NaN);
}

/**
 * Two lines that say opposite things: one negates a word the other states
 * ("không_bị" against "bị"), however many other words they share.
 */
function contradicts(a: readonly string[], b: readonly string[]): boolean {
  const negates = (from: readonly string[], to: Set<string>): boolean =>
    from.some(
      (token) =>
        token.startsWith(NEGATED) && to.has(token.slice(NEGATED.length))
    );
  return negates(a, new Set(b)) || negates(b, new Set(a));
}

/** Single-word keywords: a word that names an aspect ("nóng", "lag"). */
const ASPECT_WORDS: ReadonlySet<string> = new Set(
  Object.values(CRITERION_KEYWORDS)
    .flat()
    .filter((keyword) => !keyword.includes(SPACE))
);

/**
 * Two lines that state different facts while sharing most words: each names
 * an aspect the other does not ("máy nóng khi chơi game" against "máy lag
 * khi chơi game"), or their numbers differ ("1 ngày" against "2 ngày").
 */
function differentClaims(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  const only = (
    from: Set<string>,
    to: Set<string>,
    test: (word: string) => boolean
  ): boolean => [...from].some((word) => test(word) && !to.has(word));
  const isAspect = (word: string): boolean => ASPECT_WORDS.has(word);
  const isNumber = (word: string): boolean => /^\p{N}+$/u.test(word);
  return (
    (only(left, right, isAspect) && only(right, left, isAspect)) ||
    only(left, right, isNumber) ||
    only(right, left, isNumber)
  );
}

/**
 * How well a line matches a cluster's first line: 0 when they contradict or
 * state different facts; at least POINT_CLUSTER_OVERLAP when every word of
 * the shorter one (two words or more) is in the longer one ("pin trâu" in
 * "pin trâu dùng cả ngày"); otherwise their word overlap.
 */
function matchScore(a: readonly string[], b: readonly string[]): number {
  if (contradicts(a, b) || differentClaims(a, b)) return 0;
  const overlap = wordOverlap(a, b);
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const inside = new Set(longer);
  const contained =
    new Set(shorter).size >= 2 && shorter.every((word) => inside.has(word));
  return contained ? Math.max(overlap, POINT_CLUSTER_OVERLAP) : overlap;
}

/**
 * The lines that may count: a writer, a finite positive weight, a date, a
 * length rate.review_points allows, words in it, and not a dodge.
 */
function countedLines(
  categorySlug: string | null | undefined,
  lines: readonly PointLine[],
  now: Date,
  hideAiLines: boolean
): Line[] {
  const counted: Line[] = [];
  const seen = new Set<string>();
  for (const source of lines) {
    // A line read twice counts once.
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    if (hideAiLines && isAiLine(source)) continue;
    if (source.kind !== 'pro' && source.kind !== 'con') continue;
    if (!Number.isFinite(source.weight) || source.weight <= 0) continue;
    if (typeof source.writerId !== 'string' || !source.writerId.trim())
      continue;
    const dated = asDate(source.writtenAt);
    if (Number.isNaN(dated.getTime())) continue;
    // A future date is now: it neither escapes decay nor keeps a point fresh.
    const writtenAt = dated.getTime() > now.getTime() ? now : dated;
    const body = String(source.body ?? EMPTY).trim();
    const length = [...body.normalize('NFKC')].length;
    if (length < REVIEW_POINT_MIN || length > REVIEW_POINT_MAX) continue;
    if (!hasContent(body)) continue;
    if (source.kind === 'con' && isEvasiveCon(body)) continue;
    const tokens = pointTokens(body);
    if (tokens.length === 0) continue;
    counted.push({
      source,
      writer: source.writerId.trim(),
      criterionKey: assignPointCriterion(
        categorySlug,
        source.criterionKey,
        source.body
      ),
      tokens,
      form: tokens.join(SPACE),
      writtenAt,
    });
  }
  // Oldest first, so a cluster's key and leader do not depend on read order.
  return counted.sort(
    (a, b) =>
      a.writtenAt.getTime() - b.writtenAt.getTime() ||
      (a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : 0)
  );
}

/**
 * Greedy clustering within one criterion and kind: a line joins the cluster
 * whose first line it overlaps most, at POINT_CLUSTER_OVERLAP or more, or
 * starts a new one. Comparing with the first line, not any member, keeps a
 * chain of small steps from joining two different points.
 */
function clusterLines(lines: readonly Line[]): Line[][] {
  const clusters: Line[][] = [];
  for (const line of lines) {
    let best: Line[] | undefined;
    let bestOverlap = POINT_CLUSTER_OVERLAP;
    for (const cluster of clusters) {
      const leader = cluster[0]!;
      if (
        leader.criterionKey !== line.criterionKey ||
        leader.source.kind !== line.source.kind
      )
        continue;
      const overlap = matchScore(leader.tokens, line.tokens);
      if (overlap >= bestOverlap && (!best || overlap > bestOverlap)) {
        best = cluster;
        bestOverlap = overlap;
      }
    }
    if (best) best.push(line);
    else clusters.push([line]);
  }
  return clusters;
}

/** The label: the form most writers used, in its first writer's words. */
function clusterLabel(lines: readonly Line[]): string {
  // The writers' own words when the cluster has any; AI lines label a
  // cluster only of AI lines (DOS/Rate#1531).
  const written = lines.filter((line) => !isAiLine(line.source));
  const source = written.length > 0 ? written : lines;
  const forms = new Map<string, { writers: Set<string>; first: Line }>();
  for (const line of source) {
    const entry = forms.get(line.form);
    if (entry) entry.writers.add(line.writer);
    else
      forms.set(line.form, {
        writers: new Set([line.writer]),
        first: line,
      });
  }
  let best: { writers: Set<string>; first: Line } | undefined;
  for (const entry of forms.values())
    if (!best || entry.writers.size > best.writers.size) best = entry;
  return best!.first.source.body.trim().replace(/\s+/g, ' ');
}

function isAiLine(line: PointLine): boolean {
  return line.method === AI_METHOD;
}

// A constant, because the rules import check reads a quote on an export
// line as a module path.
const AI_METHOD = 'ai';

/**
 * What a line adds for its writer: its decayed weight, or for an AI line
 * POINT_AI_WEIGHT_SHARE of that weight capped at POINT_WRITER_SHARE_CAP.
 */
function lineSupport(line: Line, now: Date): number {
  const weight = decayedWeight(line.source.weight, line.writtenAt, now);
  return isAiLine(line.source)
    ? POINT_AI_WEIGHT_SHARE * Math.min(weight, POINT_WRITER_SHARE_CAP)
    : weight;
}

function summarise(lines: readonly Line[], now: Date): PointCluster {
  const leader = lines[0]!;
  // Each writer counts once, with their strongest line in the cluster.
  const writers = new Map<string, number>();
  // Writers with a line of their own; the rest are AI-only.
  const ownWords = new Set<string>();
  let hasExpert = false;
  for (const line of lines) {
    if (!isAiLine(line.source)) ownWords.add(line.writer);
    const weight = lineSupport(line, now);
    writers.set(line.writer, Math.max(writers.get(line.writer) ?? 0, weight));
    // An expert counts while their line is fresh: an old expert line does not
    // lift a new single writer's point (design 5.3). An AI line is never an
    // expert's own words.
    if (
      line.source.isExpert &&
      !isAiLine(line.source) &&
      now.getTime() - line.writtenAt.getTime() <= POINT_SILENT_MS
    )
      hasExpert = true;
  }
  let rawSupport = 0;
  let shownSupport = 0;
  for (const weight of writers.values()) {
    rawSupport += weight;
    shownSupport += Math.min(weight, POINT_WRITER_SHARE_CAP);
  }
  const support = Math.round(rawSupport * 100) / 100;
  const firstSeen = leader.writtenAt;
  const lastSeen = lines[lines.length - 1]!.writtenAt;
  const fresh = now.getTime() - lastSeen.getTime() <= POINT_SILENT_MS;
  const passes =
    (writers.size >= POINT_MIN_WRITERS && shownSupport >= POINT_MIN_SUPPORT) ||
    hasExpert;
  return {
    key: `${leader.criterionKey ?? GENERAL_POINTS}:${leader.source.kind}:${leader.source.id}`,
    criterionKey: leader.criterionKey,
    kind: leader.source.kind,
    label: clusterLabel(lines),
    support,
    reviewerCount: writers.size,
    aiReviewerCount: writers.size - ownWords.size,
    hasExpert,
    firstSeen,
    lastSeen,
    lineIds: lines.map((line) => line.source.id),
    visible: passes && fresh,
  };
}

/**
 * Display order: a point with at least one writer's own line before an
 * AI-only one (DOS/Rate#1531), then more support, more writers, an expert,
 * then newer. AI-only points stay eligible below them.
 */
function byRank(a: PointCluster, b: PointCluster): number {
  return (
    Number(hasOwnWords(b)) - Number(hasOwnWords(a)) ||
    b.support - a.support ||
    b.reviewerCount - a.reviewerCount ||
    Number(b.hasExpert) - Number(a.hasExpert) ||
    b.lastSeen.getTime() - a.lastSeen.getTime() ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

function hasOwnWords(cluster: PointCluster): boolean {
  return cluster.reviewerCount > cluster.aiReviewerCount;
}

function sides(clusters: readonly PointCluster[], max: number): PointSides {
  return {
    pros: clusters.filter((cl) => cl.kind === 'pro').slice(0, max),
    cons: clusters.filter((cl) => cl.kind === 'con').slice(0, max),
  };
}

/** Reviews counted only through AI lines. */
function aiOnlyReviews(lines: readonly Line[]): number {
  const own = new Set<string>();
  const ai = new Set<string>();
  for (const line of lines)
    (isAiLine(line.source) ? ai : own).add(line.source.reviewId);
  let count = 0;
  for (const reviewId of ai) if (!own.has(reviewId)) count += 1;
  return count;
}

/**
 * A product's pros and cons from its review lines (design 5.1 and 5.3):
 * lines of gated reviews (weight 0), dodging cons and lines with no words
 * are left out; the rest are clustered per criterion and kind, counted once
 * per writer and shown under D9. Lines AI extracted count at
 * POINT_AI_WEIGHT_SHARE, or not at all with `hideAiLines`. `now` is the run's
 * clock, so a run is repeatable.
 */
export function aggregateProductPoints(
  categorySlug: string | null | undefined,
  lines: readonly PointLine[],
  now: Date,
  options: ProductPointsOptions = {}
): ProductPoints {
  const counted = countedLines(
    categorySlug,
    lines,
    now,
    options?.hideAiLines === true
  );
  const clusters = clusterLines(counted)
    .map((cluster) => summarise(cluster, now))
    .sort(byRank);
  const shown = clusters.filter((cl) => cl.visible);
  const byCriterion: Record<string, PointSides> = {};
  for (const key of new Set(
    shown.map((cl) => cl.criterionKey ?? GENERAL_POINTS)
  ))
    byCriterion[key] = sides(
      shown.filter((cl) => (cl.criterionKey ?? GENERAL_POINTS) === key),
      PRODUCT_CRITERION_POINTS_MAX
    );
  // Each side has its own five places, so a passing con is always kept in
  // the summary however many pros pass (design 5.1, "luôn giữ nhược điểm").
  const summary = sides(shown, PRODUCT_POINTS_MAX);
  return {
    clusters,
    byCriterion,
    summary,
    reviewCount: new Set(counted.map((line) => line.source.reviewId)).size,
    aiReviewCount: aiOnlyReviews(counted),
    updatedAt: now,
  };
}
