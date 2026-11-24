/**
 * Rating criteria per category, with weights (DOS/Rate#1542, design #1531, D1).
 *
 * A Rate review rates each criterion of its category in stars, and its own
 * star is the weighted average of the criteria it rated, as in JReviews.
 * The lists are versioned: a review keeps the version it was written with, so
 * a later change of weights never rewrites stored reviews. Plain data and
 * functions only, like the rest of `rules`.
 */
import type { SpecGroupKey } from './spec-template.js';

/** Bump whenever a list, a key or a weight changes. */
export const RATING_CRITERIA_VERSION = 1;

/** Schema version for Wave E1 appliance and Wave E2 service criteria. */
export const RATING_CRITERIA_V2_VERSION = 2;

const V2_RATING_CRITERIA_CATEGORIES = new Set<string>([
  'tvs',
  'air-conditioners',
  'refrigerators',
  'washing-machines',
  'air-purifiers',
  'bank-savings',
  'internet-telecom',
]);

const CRITERION_KEYS = [
  'performance',
  'camera',
  'battery',
  'display',
  'design',
  'value',
  'sound',
  'software',
  'keyboard',
  'thermals',
  'health',
  'apps',
  'anc',
  'comfort',
  'calls',
  'connectivity',
  'cooling',
  'energy_efficiency',
  'noise',
  'durability',
  'features',
  'capacity',
  'wash_quality',
  'filtration',
  'filter_cost',
  'service_quality',
  'price',
  'attitude',
  'speed',
] as const;

export type RatingCriterionKey = (typeof CRITERION_KEYS)[number];

export const RATING_CRITERION_KEYS: readonly RatingCriterionKey[] =
  CRITERION_KEYS;

const KNOWN_CRITERION_KEY_SET = new Set<string>(RATING_CRITERION_KEYS);
const LOCALE_CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function isRatingCriterionKey(key: unknown): key is RatingCriterionKey {
  const candidate = key;
  return (
    typeof candidate === 'string' && KNOWN_CRITERION_KEY_SET.has(candidate)
  );
}

export interface RatingCriterion {
  key: RatingCriterionKey;
  label: { vi: string; en: string; cs: string };
  /** Share of the review star, in percent; a category's weights sum to 100. */
  weight: number;
  /** The spec group shown beside the score, when one fits. */
  specGroup: SpecGroupKey | null;
  /** A criterion every review must rate ("Đáng tiền", D5). */
  required: boolean;
}

/**
 * Localized label of a criterion for `vi`, `en`, or `cs` (including regional
 * tags such as `cs-CZ`), defaulting blank/missing inputs to `vi` and falling
 * back to English for unknown non-vi locales.
 */
export function getRatingCriterionLabel(
  criterion: Pick<RatingCriterion, 'label'>,
  locale: string | null | undefined
): string {
  const raw = locale;
  const cleaned =
    typeof raw === 'string'
      ? raw.replace(LOCALE_CONTROL_CHARS_RE, '').trim()
      : '';
  const primary = cleaned
    ? cleaned.slice(0, 32).toLowerCase().split(/[-_]/)[0]
    : 'vi';
  if (primary === 'vi') return criterion.label.vi;
  if (primary === 'cs') return criterion.label.cs;
  return criterion.label.en;
}

/** The most criteria a review may leave unrated ("Chưa dùng tới", D5). */
export const MAX_SKIPPED_CRITERIA = 2;

const c = (
  key: RatingCriterionKey,
  vi: string,
  en: string,
  cs: string,
  weight: number,
  specGroup: SpecGroupKey | null,
  required = false
): RatingCriterion => ({
  key,
  label: { vi, en, cs },
  weight,
  specGroup,
  required,
});

const VALUE = c(
  'value',
  'Đáng tiền',
  'Value for money',
  'Poměr cena / výkon',
  15,
  null,
  true
);

const RATING_CRITERIA: Readonly<Record<string, readonly RatingCriterion[]>> = {
  smartphones: [
    c('performance', 'Hiệu năng', 'Performance', 'Výkon', 20, 'hardware'),
    c('camera', 'Camera', 'Camera', 'Fotoaparát', 20, 'camera'),
    c(
      'battery',
      'Pin và sạc',
      'Battery and charging',
      'Baterie a nabíjení',
      20,
      'battery'
    ),
    c('display', 'Màn hình', 'Display', 'Displej', 15, 'display'),
    c(
      'design',
      'Thiết kế và độ bền',
      'Design and build',
      'Design a zpracování',
      10,
      'design'
    ),
    VALUE,
  ],
  tablets: [
    c('display', 'Màn hình', 'Display', 'Displej', 20, 'display'),
    c('performance', 'Hiệu năng', 'Performance', 'Výkon', 20, 'hardware'),
    c('battery', 'Pin', 'Battery', 'Baterie', 15, 'battery'),
    c(
      'sound',
      'Loa và giải trí',
      'Speakers and media',
      'Reproduktory a multimédia',
      10,
      'multimedia'
    ),
    c(
      'software',
      'Phần mềm và phụ kiện',
      'Software and accessories',
      'Software a příslušenství',
      10,
      null
    ),
    c('design', 'Thiết kế', 'Design', 'Design', 10, 'design'),
    VALUE,
  ],
  laptops: [
    c('performance', 'Hiệu năng', 'Performance', 'Výkon', 25, 'hardware'),
    c('display', 'Màn hình', 'Display', 'Displej', 15, 'display'),
    c('battery', 'Pin', 'Battery', 'Baterie', 15, 'battery'),
    c(
      'keyboard',
      'Bàn phím và touchpad',
      'Keyboard and touchpad',
      'Klávesnice a touchpad',
      10,
      null
    ),
    c(
      'thermals',
      'Tản nhiệt và độ ồn',
      'Thermals and noise',
      'Chlazení a hlučnost',
      10,
      'hardware'
    ),
    c(
      'design',
      'Thiết kế và độ bền',
      'Design and build',
      'Design a zpracování',
      10,
      'design'
    ),
    VALUE,
  ],
  smartwatches: [
    c(
      'health',
      'Theo dõi sức khoẻ',
      'Health tracking',
      'Sledování zdraví',
      25,
      null
    ),
    c('battery', 'Pin', 'Battery', 'Baterie', 20, 'battery'),
    c(
      'design',
      'Thiết kế và đeo',
      'Design and fit',
      'Design a nošení',
      15,
      'design'
    ),
    c(
      'apps',
      'Ứng dụng và kết nối',
      'Apps and connectivity',
      'Aplikace a konektivita',
      15,
      'connectivity'
    ),
    c('display', 'Màn hình', 'Display', 'Displej', 10, 'display'),
    VALUE,
  ],
  earbuds: [
    c('sound', 'Chất âm', 'Sound quality', 'Kvalita zvuku', 30, 'multimedia'),
    c(
      'anc',
      'Chống ồn',
      'Noise cancelling',
      'Potlačení hluku',
      15,
      'multimedia'
    ),
    c('battery', 'Pin', 'Battery', 'Baterie', 15, 'battery'),
    c(
      'comfort',
      'Đeo thoải mái',
      'Comfort',
      'Pohodlí při nošení',
      15,
      'design'
    ),
    c(
      'calls',
      'Mic và gọi',
      'Microphone and calls',
      'Mikrofon a hovory',
      10,
      'multimedia'
    ),
    VALUE,
  ],
  // Services (entity_type = 'service'): price is what every review must rate.
  services: [
    c(
      'service_quality',
      'Chất lượng dịch vụ',
      'Service quality',
      'Kvalita služeb',
      35,
      null
    ),
    c('price', 'Giá cả', 'Price', 'Cena', 25, null, true),
    c(
      'attitude',
      'Thái độ phục vụ',
      'Staff attitude',
      'Přístup personálu',
      20,
      null
    ),
    c('speed', 'Tốc độ', 'Speed', 'Rychlost', 20, null),
  ],
  tvs: [
    c(
      'display',
      'Màn hình và hình ảnh',
      'Display',
      'Displej a obraz',
      30,
      'display'
    ),
    c('sound', 'Âm thanh', 'Sound quality', 'Kvalita zvuku', 15, 'multimedia'),
    c(
      'software',
      'Hệ điều hành và Smart TV',
      'Software and Smart TV',
      'Software a Smart TV',
      15,
      null
    ),
    c(
      'connectivity',
      'Cổng kết nối',
      'Connectivity',
      'Konektivita',
      10,
      'connectivity'
    ),
    c('design', 'Thiết kế', 'Design', 'Design', 10, 'design'),
    c(
      'value',
      'Đáng tiền',
      'Value for money',
      'Poměr cena / výkon',
      20,
      null,
      true
    ),
  ],
  'air-conditioners': [
    c('cooling', 'Làm lạnh', 'Cooling performance', 'Chladicí výkon', 30, null),
    c(
      'energy_efficiency',
      'Tiết kiệm điện',
      'Energy efficiency',
      'Energetická účinnost',
      20,
      null
    ),
    c('noise', 'Độ ồn', 'Noise level', 'Hlučnost', 15, null),
    c('durability', 'Độ bền', 'Durability', 'Odolnost', 10, null),
    c('features', 'Tính năng', 'Features', 'Funkce', 10, null),
    VALUE,
  ],
  refrigerators: [
    c(
      'cooling',
      'Làm lạnh và bảo quản',
      'Cooling performance',
      'Chlazení a uchování',
      25,
      null
    ),
    c(
      'energy_efficiency',
      'Tiết kiệm điện',
      'Energy efficiency',
      'Energetická účinnost',
      20,
      null
    ),
    c(
      'capacity',
      'Dung tích và bố trí',
      'Capacity and layout',
      'Objem a uspořádání',
      15,
      null
    ),
    c('noise', 'Độ ồn', 'Noise level', 'Hlučnost', 15, null),
    c('design', 'Thiết kế', 'Design', 'Design', 10, 'design'),
    VALUE,
  ],
  'washing-machines': [
    c(
      'wash_quality',
      'Hiệu quả giặt',
      'Wash quality',
      'Kvalita praní',
      30,
      null
    ),
    c(
      'noise',
      'Độ ồn và chống rung',
      'Noise and vibration',
      'Hlučnost a vibrace',
      15,
      null
    ),
    c(
      'energy_efficiency',
      'Tiết kiệm điện nước',
      'Energy efficiency',
      'Energetická účinnost',
      15,
      null
    ),
    c('durability', 'Độ bền', 'Durability', 'Odolnost', 15, null),
    c('features', 'Tính năng', 'Features', 'Funkce', 10, null),
    VALUE,
  ],
  'air-purifiers': [
    c(
      'filtration',
      'Hiệu quả lọc khí',
      'Filtration performance',
      'Účinnost filtrace',
      30,
      null
    ),
    c('noise', 'Độ ồn', 'Noise level', 'Hlučnost', 20, null),
    c(
      'filter_cost',
      'Chi phí thay lõi lọc',
      'Filter replacement cost',
      'Cena náhradních filtrů',
      15,
      null
    ),
    c(
      'features',
      'Tính năng và cảm biến',
      'Features and sensors',
      'Funkce a senzory',
      10,
      null
    ),
    c('design', 'Thiết kế', 'Design', 'Design', 10, 'design'),
    VALUE,
  ],
  'bank-savings': [
    c(
      'service_quality',
      'Chất lượng dịch vụ',
      'Service quality',
      'Kvalita služeb',
      35,
      null
    ),
    c(
      'price',
      'Lãi suất và phí',
      'Rates and fees',
      'Úroky a poplatky',
      25,
      null,
      true
    ),
    c(
      'attitude',
      'Thái độ phục vụ',
      'Staff attitude',
      'Přístup personálu',
      20,
      null
    ),
    c('speed', 'Tốc độ', 'Speed', 'Rychlost', 20, null),
  ],
  'internet-telecom': [
    c(
      'service_quality',
      'Chất lượng dịch vụ',
      'Service quality',
      'Kvalita služeb',
      35,
      null
    ),
    c('price', 'Giá cước', 'Price', 'Cena', 25, null, true),
    c(
      'attitude',
      'Thái độ phục vụ',
      'Staff attitude',
      'Přístup personálu',
      20,
      null
    ),
    c('speed', 'Tốc độ', 'Speed', 'Rychlost', 20, null),
  ],
};

/**
 * Criteria schema version for a category slug.
 * Existing v1 categories stay pinned at 1 while Wave E1/E2 categories use v2.
 */
export function getRatingCriteriaVersion(
  categorySlug: string | null | undefined
): 1 | 2 {
  const raw = categorySlug;
  const normalized =
    typeof raw === 'string'
      ? raw.replace(LOCALE_CONTROL_CHARS_RE, '').trim().toLowerCase()
      : '';
  return V2_RATING_CRITERIA_CATEGORIES.has(normalized)
    ? RATING_CRITERIA_V2_VERSION
    : RATING_CRITERIA_VERSION;
}

/** Categories with their own criteria list. */
export const RATING_CRITERIA_CATEGORIES: readonly string[] =
  Object.keys(RATING_CRITERIA);

/**
 * The criteria of a category, in display order. A category without its own
 * list (or none given) rates as a smartphone, the catalog's default category.
 */
export function getRatingCriteria(
  categorySlug: string | null | undefined
): readonly RatingCriterion[] {
  return (
    ownValue(RATING_CRITERIA, categorySlug) ?? RATING_CRITERIA.smartphones!
  );
}

/**
 * Whether a category has its own criteria list. An API that must not rate a
 * new category ("tvs") or a typo ("service") as a phone checks this first.
 */
export function hasRatingCriteria(
  categorySlug: string | null | undefined
): boolean {
  return ownValue(RATING_CRITERIA, categorySlug) !== undefined;
}

/**
 * A record's own entry: "toString" or "__proto__" as a category slug or a
 * rating key never reaches Object.prototype.
 */
function ownValue<T>(
  record: Readonly<Record<string, T>> | null | undefined,
  key: string | null | undefined
): T | undefined {
  return record && key && Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}

/**
 * Criterion stars as stored in `rate.reviews.criteria_ratings`. A criterion
 * the writer left out ("Chưa dùng tới") is missing, undefined or null.
 */
export type CriteriaRatings = Partial<Record<string, number | null>>;

export type CriteriaRatingsIssue =
  | { kind: 'unknown_key'; key: string }
  | { kind: 'bad_star'; key: string }
  | { kind: 'missing_required'; key: RatingCriterionKey }
  | { kind: 'too_many_skipped'; skipped: number };

/** A stored star: any number from 1 to 5 (legacy reviews kept 0.1 steps). */
function isStoredStar(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 5
  );
}

/** A star the form gives: 1 to 5 in half steps. */
function isStar(value: unknown): value is number {
  return isStoredStar(value) && Number.isInteger(value * 2);
}

/**
 * What is wrong with a review's criterion stars under D5: a key the category
 * does not have, a star outside 1-5 in half steps, a required criterion left
 * out, or more than MAX_SKIPPED_CRITERIA criteria left out. An empty list is
 * a valid review.
 */
export function validateCriteriaRatings(
  categorySlug: string | null | undefined,
  ratings: CriteriaRatings
): CriteriaRatingsIssue[] {
  const criteria = getRatingCriteria(categorySlug);
  const known = new Set<string>(criteria.map((criterion) => criterion.key));
  const issues: CriteriaRatingsIssue[] = [];
  const given = ratings && typeof ratings === 'object' ? ratings : {};
  for (const [key, star] of Object.entries(given)) {
    if (!known.has(key)) issues.push({ kind: 'unknown_key', key });
    else if (star != null && !isStar(star))
      issues.push({ kind: 'bad_star', key });
  }
  let skipped = 0;
  for (const criterion of criteria) {
    if (ownValue(given, criterion.key) != null) continue;
    if (criterion.required)
      issues.push({ kind: 'missing_required', key: criterion.key });
    else skipped += 1;
  }
  if (skipped > MAX_SKIPPED_CRITERIA)
    issues.push({ kind: 'too_many_skipped', skipped });
  return issues;
}

/**
 * A review's own star: the weighted average of the criteria it rated, at one
 * decimal (design 2.2). Keys the category does not have and stars outside
 * 1-5 are ignored; null when nothing valid is rated. Any star from 1 to 5
 * counts, so a legacy review's 0.1-step stars do too: half steps are a rule
 * of the form (validateCriteriaRatings), not of stored data.
 */
export function weightedReviewStar(
  categorySlug: string | null | undefined,
  ratings: CriteriaRatings
): number | null {
  let sum = 0;
  let weights = 0;
  for (const criterion of getRatingCriteria(categorySlug)) {
    const star = ownValue(ratings, criterion.key);
    if (!isStoredStar(star)) continue;
    sum += star * criterion.weight;
    weights += criterion.weight;
  }
  if (weights === 0) return null;
  return Math.round((sum * 10) / weights) / 10;
}

/** The five keys of the first review form, before the per-category lists. */
export type LegacyCriterionKey =
  'screen' | 'performance' | 'camera' | 'battery' | 'value';

// What each legacy key rated per category. The product page labels an
// earbud's "screen" score soundstage and its "camera" score ANC / mic, so
// they map to sound and anc. A key with no counterpart (a tablet's, laptop's
// or watch's camera, a watch's or earbud's performance) maps to nothing and
// its star is dropped. A mapped legacy review can rate fewer criteria than
// validateCriteriaRatings asks of a new one: that check is for new reviews.
const LEGACY_MAP: Readonly<
  Record<string, Partial<Record<LegacyCriterionKey, RatingCriterionKey>>>
> = {
  smartphones: {
    screen: 'display',
    performance: 'performance',
    camera: 'camera',
    battery: 'battery',
    value: 'value',
  },
  tablets: {
    screen: 'display',
    performance: 'performance',
    battery: 'battery',
    value: 'value',
  },
  laptops: {
    screen: 'display',
    performance: 'performance',
    battery: 'battery',
    value: 'value',
  },
  smartwatches: { screen: 'display', battery: 'battery', value: 'value' },
  earbuds: {
    screen: 'sound',
    camera: 'anc',
    battery: 'battery',
    value: 'value',
  },
  services: {},
  tvs: {},
  'air-conditioners': {},
  refrigerators: {},
  'washing-machines': {},
  'air-purifiers': {},
  'bank-savings': {},
  'internet-telecom': {},
};

/**
 * A review written with the five legacy keys, in the category's keys. A
 * criterion the legacy form did not ask stays unrated: nothing is inferred.
 * The review API stored legacy stars at 0.1, so any star from 1 to 5
 * carries over as it is.
 */
export function mapLegacyCriteriaRatings(
  categorySlug: string | null | undefined,
  legacy: Partial<Record<string, unknown>>
): CriteriaRatings {
  const map = ownValue(LEGACY_MAP, categorySlug) ?? LEGACY_MAP.smartphones!;
  const out: CriteriaRatings = {};
  for (const [legacyKey, key] of Object.entries(map)) {
    const star = ownValue(legacy, legacyKey);
    if (key && isStoredStar(star)) out[key] = star;
  }
  return out;
}

const DEVICE_CATEGORIES = [
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
] as const;

export type DeviceRatingCategorySlug = (typeof DEVICE_CATEGORIES)[number];

export const RATING_DEVICE_CATEGORIES: readonly DeviceRatingCategorySlug[] =
  DEVICE_CATEGORIES;

const USE_CASE_PRESET_IDS = [
  'default',
  'gaming',
  'camera',
  'endurance',
  'value',
  'media',
  'study_work',
  'office',
  'creator',
  'fitness',
  'smart_daily',
  'audiophile',
  'commute_anc',
  'calls_work',
] as const;

export type UseCasePresetId = (typeof USE_CASE_PRESET_IDS)[number];

export const RATING_USE_CASE_PRESET_IDS: readonly UseCasePresetId[] =
  USE_CASE_PRESET_IDS;

const KNOWN_USE_CASE_PRESET_ID_SET = new Set<string>(
  RATING_USE_CASE_PRESET_IDS
);

export function isUseCasePresetId(key: unknown): key is UseCasePresetId {
  const candidate = key;
  return (
    typeof candidate === 'string' && KNOWN_USE_CASE_PRESET_ID_SET.has(candidate)
  );
}

export interface RatingUseCasePreset {
  readonly id: UseCasePresetId;
  readonly label: {
    readonly vi: string;
    readonly en: string;
    readonly cs: string;
  };
  /** Share of each category criterion in percent; a preset's weights sum to 100. */
  readonly weights: Readonly<Partial<Record<RatingCriterionKey, number>>>;
}

const p = (
  id: UseCasePresetId,
  vi: string,
  en: string,
  cs: string,
  weights: Readonly<Partial<Record<RatingCriterionKey, number>>>
): RatingUseCasePreset => ({
  id,
  label: { vi, en, cs },
  weights,
});

function defaultPresetWeights(
  categorySlug: string
): Readonly<Partial<Record<RatingCriterionKey, number>>> {
  const out: Partial<Record<RatingCriterionKey, number>> = {};
  for (const criterion of getRatingCriteria(categorySlug)) {
    out[criterion.key] = criterion.weight;
  }
  return out;
}

const RATING_USE_CASE_PRESETS: Readonly<
  Record<string, readonly RatingUseCasePreset[]>
> = {
  smartphones: [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('smartphones')
    ),
    p(
      'gaming',
      'Cày game & pin trâu',
      'Gaming & battery',
      'Hraní her a výdrž',
      {
        performance: 40,
        battery: 25,
        display: 15,
        value: 10,
        camera: 5,
        design: 5,
      }
    ),
    p(
      'camera',
      'Nhiếp ảnh & quay vlog',
      'Camera & creator',
      'Fotoaparát a vlog',
      {
        camera: 45,
        display: 20,
        battery: 15,
        performance: 10,
        design: 5,
        value: 5,
      }
    ),
    p(
      'endurance',
      'Bền bỉ & thực dụng',
      'Endurance & durability',
      'Výdrž a odolnost',
      {
        battery: 35,
        design: 25,
        value: 20,
        performance: 10,
        display: 5,
        camera: 5,
      }
    ),
    p('value', 'Đáng tiền nhất (P/P)', 'Value-first', 'Nejlepší cena / výkon', {
      value: 40,
      performance: 20,
      battery: 15,
      display: 10,
      camera: 10,
      design: 5,
    }),
  ],
  tablets: [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('tablets')
    ),
    p(
      'media',
      'Xem phim & giải trí',
      'Media & entertainment',
      'Filmy a zábava',
      {
        display: 35,
        sound: 25,
        battery: 20,
        performance: 5,
        software: 5,
        design: 5,
        value: 5,
      }
    ),
    p(
      'study_work',
      'Học tập & ghi chú',
      'Study & productivity',
      'Studium a poznámky',
      {
        software: 25,
        display: 20,
        battery: 20,
        performance: 15,
        design: 10,
        sound: 5,
        value: 5,
      }
    ),
    p(
      'gaming',
      'Chơi game & đa nhiệm',
      'Gaming & multitasking',
      'Hraní her a výkon',
      {
        performance: 40,
        display: 25,
        battery: 15,
        sound: 5,
        software: 5,
        design: 5,
        value: 5,
      }
    ),
    p('value', 'Đáng tiền nhất (P/P)', 'Value-first', 'Nejlepší cena / výkon', {
      value: 40,
      display: 15,
      performance: 15,
      battery: 15,
      sound: 5,
      software: 5,
      design: 5,
    }),
  ],
  laptops: [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('laptops')
    ),
    p(
      'office',
      'Văn phòng & di động',
      'Office & portability',
      'Kancelář a mobilita',
      {
        battery: 30,
        keyboard: 20,
        design: 20,
        display: 10,
        performance: 10,
        thermals: 5,
        value: 5,
      }
    ),
    p(
      'creator',
      'Lập trình & đồ họa nặng',
      'Coding & creator',
      'Programování a grafika',
      {
        performance: 35,
        display: 25,
        thermals: 15,
        keyboard: 10,
        battery: 5,
        design: 5,
        value: 5,
      }
    ),
    p(
      'gaming',
      'Gaming & tản nhiệt',
      'Gaming & thermals',
      'Hraní her a chlazení',
      {
        performance: 40,
        thermals: 25,
        display: 15,
        keyboard: 5,
        battery: 5,
        design: 5,
        value: 5,
      }
    ),
    p('value', 'Đáng tiền nhất (P/P)', 'Value-first', 'Nejlepší cena / výkon', {
      value: 40,
      performance: 20,
      battery: 15,
      display: 10,
      keyboard: 5,
      thermals: 5,
      design: 5,
    }),
  ],
  smartwatches: [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('smartwatches')
    ),
    p('fitness', 'Thể thao & sức khỏe', 'Fitness & health', 'Sport a zdraví', {
      health: 45,
      battery: 25,
      design: 10,
      display: 10,
      apps: 5,
      value: 5,
    }),
    p(
      'endurance',
      'Pin dài ngày & đi phượt',
      'Multi-day endurance',
      'Vícedenní výdrž',
      {
        battery: 45,
        design: 20,
        health: 15,
        display: 10,
        apps: 5,
        value: 5,
      }
    ),
    p(
      'smart_daily',
      'Đeo hằng ngày & tiện ích',
      'Smart apps & daily wear',
      'Chytré funkce a nošení',
      {
        apps: 30,
        design: 25,
        display: 20,
        health: 10,
        battery: 10,
        value: 5,
      }
    ),
    p('value', 'Đáng tiền nhất (P/P)', 'Value-first', 'Nejlepší cena / výkon', {
      value: 40,
      health: 20,
      battery: 15,
      design: 10,
      apps: 10,
      display: 5,
    }),
  ],
  earbuds: [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('earbuds')
    ),
    p(
      'audiophile',
      'Nghe nhạc chuyên sâu',
      'Audiophile sound',
      'Audiofilský poslech',
      {
        sound: 50,
        comfort: 20,
        anc: 10,
        battery: 10,
        calls: 5,
        value: 5,
      }
    ),
    p(
      'commute_anc',
      'Đi làm & chống ồn ANC',
      'ANC & commute',
      'Cestování a ANC',
      {
        anc: 40,
        comfort: 25,
        battery: 15,
        sound: 10,
        calls: 5,
        value: 5,
      }
    ),
    p(
      'calls_work',
      'Họp online & đàm thoại',
      'Meetings & calls',
      'Schůzky a hovory',
      {
        calls: 40,
        comfort: 25,
        battery: 15,
        anc: 10,
        sound: 5,
        value: 5,
      }
    ),
    p('value', 'Đáng tiền nhất (P/P)', 'Value-first', 'Nejlepší cena / výkon', {
      value: 40,
      sound: 25,
      battery: 15,
      anc: 10,
      comfort: 5,
      calls: 5,
    }),
  ],
  services: [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('services')
    ),
  ],
  tvs: [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('tvs')
    ),
  ],
  'air-conditioners': [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('air-conditioners')
    ),
  ],
  refrigerators: [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('refrigerators')
    ),
  ],
  'washing-machines': [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('washing-machines')
    ),
  ],
  'air-purifiers': [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('air-purifiers')
    ),
  ],
  'bank-savings': [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('bank-savings')
    ),
  ],
  'internet-telecom': [
    p(
      'default',
      'Cân bằng mặc định',
      'Balanced default',
      'Vyvážený výchozí',
      defaultPresetWeights('internet-telecom')
    ),
  ],
};

/**
 * Curated RTINGS-style use-case presets for a category (DOS/Rate#1864).
 * Unknown or null categories fall back to `smartphones`, matching `getRatingCriteria`.
 */
export function getRatingUseCasePresets(
  categorySlug: string | null | undefined
): readonly RatingUseCasePreset[] {
  const raw = categorySlug;
  const normalized =
    typeof raw === 'string'
      ? raw.replace(LOCALE_CONTROL_CHARS_RE, '').trim().toLowerCase()
      : '';
  return (
    ownValue(RATING_USE_CASE_PRESETS, normalized) ??
    RATING_USE_CASE_PRESETS.smartphones!
  );
}

export function getRatingUseCasePresetLabel(
  preset: Pick<RatingUseCasePreset, 'label'>,
  locale: string | null | undefined
): string {
  return getRatingCriterionLabel(preset, locale);
}
