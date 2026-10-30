import { getTranslations } from 'next-intl/server';
import { IntentLink } from '@/components/elementary/IntentLink';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import type { CanonicalCategorySlug } from '@/lib/rate-domain';
import type {
  LeaderboardCriterionKey,
  ProductLeaderboardBadgeInfo,
} from '@/lib/leaderboard-engine';
import { BsAwardFill, BsTrophyFill } from 'react-icons/bs';
import { formatDecimal } from '@/lib/locale-format';

const VALID_BADGE_CATEGORIES = new Set<CanonicalCategorySlug>([
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

const VALID_BADGE_CRITERIA = new Set<LeaderboardCriterionKey>([
  'combined',
  'user',
  'expert',
  'screen',
  'performance',
  'camera',
  'battery',
  'value',
]);

export function sanitizeLeaderboardBadgeEntry(
  rawBadge: unknown
): ProductLeaderboardBadgeInfo | null {
  if (!rawBadge || typeof rawBadge !== 'object') return null;
  const candidate = rawBadge as Partial<ProductLeaderboardBadgeInfo>;
  if (
    typeof candidate.categorySlug !== 'string' ||
    !VALID_BADGE_CATEGORIES.has(candidate.categorySlug as CanonicalCategorySlug)
  ) {
    return null;
  }
  if (
    typeof candidate.criterion !== 'string' ||
    !VALID_BADGE_CRITERIA.has(candidate.criterion as LeaderboardCriterionKey)
  ) {
    return null;
  }
  const rank = Number(candidate.rank);
  if (!Number.isFinite(rank) || rank < 1) return null;
  const safeRank = Math.min(10_000, Math.round(rank));
  const rawTotal = Number(candidate.totalInCategory);
  const safeTotal =
    Number.isFinite(rawTotal) && rawTotal >= safeRank
      ? Math.min(100_000, Math.round(rawTotal))
      : safeRank;
  const rawScore5 = Number(candidate.score5);
  if (!Number.isFinite(rawScore5) || rawScore5 <= 0) return null;
  const safeScore5 = Math.min(5, Math.max(0, Number(rawScore5.toFixed(2))));
  const rawScore10 = Number(candidate.score10);
  const safeScore10 =
    Number.isFinite(rawScore10) && rawScore10 > 0
      ? Math.min(10, Math.max(0, Number(rawScore10.toFixed(2))))
      : Number((safeScore5 * 2).toFixed(2));

  return {
    categorySlug: candidate.categorySlug as CanonicalCategorySlug,
    criterion: candidate.criterion as LeaderboardCriterionKey,
    rank: safeRank,
    totalInCategory: safeTotal,
    score5: safeScore5,
    score10: safeScore10,
  };
}

interface ProductLeaderboardBadgesProps {
  badges: ProductLeaderboardBadgeInfo[];
  locale?: string;
}

export default async function ProductLeaderboardBadges({
  badges,
  locale,
}: ProductLeaderboardBadgesProps) {
  const validBadges = Array.isArray(badges)
    ? badges
        .map(sanitizeLeaderboardBadgeEntry)
        .filter((b): b is ProductLeaderboardBadgeInfo => b !== null)
    : [];
  if (validBadges.length === 0) {
    return null;
  }

  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'leaderboard' });

  const catNames: Record<CanonicalCategorySlug, string> = {
    smartphones: t('catSmartphones'),
    tablets: t('catTablets'),
    laptops: t('catLaptops'),
    smartwatches: t('catSmartwatches'),
    earbuds: t('catEarbuds'),
  };

  const critLabels: Record<LeaderboardCriterionKey, string> = {
    combined: t('badgeCombined'),
    user: t('badgeUser'),
    expert: t('badgeExpert'),
    screen: t('badgeScreen'),
    performance: t('badgePerformance'),
    camera: t('badgeCamera'),
    battery: t('badgeBattery'),
    value: t('badgeValue'),
  };

  const sectionLabel = t('standingLabel');

  return (
    <div
      className="d-flex align-items-center mt-3 flex-wrap gap-2 pt-3"
      style={{
        borderTop: '1px solid var(--rate-glass-border)',
      }}
    >
      <span
        className="d-inline-flex align-items-center fw-semibold gap-1"
        style={{
          fontSize: '0.8125rem',
          color: 'var(--rate-fg-paragraph)',
          letterSpacing: '0.02em',
        }}
      >
        <BsTrophyFill className="text-warning" />
        {sectionLabel}
      </span>

      {validBadges.map((b) => {
        const isFirst = b.rank === 1;
        const isCombined = b.criterion === 'combined';
        const titleText = isCombined
          ? `#${b.rank}/${b.totalInCategory} ${catNames[b.categorySlug]}`
          : `#${b.rank} ${critLabels[b.criterion]}`;

        return (
          <IntentLink
            key={`${b.categorySlug}-${b.criterion}`}
            href={`/leaderboard?cat=${b.categorySlug}&criterion=${b.criterion}`}
            className="text-decoration-none d-inline-flex align-items-center rounded-pill gap-1 px-3 py-1"
            style={{
              fontSize: '0.8125rem',
              fontWeight: 700,
              background: isFirst
                ? 'linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(216, 48, 48, 0.22) 100%)'
                : isCombined
                  ? 'rgba(56,189,248,0.16)'
                  : 'rgba(45, 186, 105, 0.15)',
              border: isFirst
                ? '1px solid rgba(251,191,36,0.55)'
                : isCombined
                  ? '1px solid rgba(56,189,248,0.38)'
                  : '1px solid rgba(45, 186, 105, 0.35)',
              color: isFirst
                ? 'var(--rate-ink-warning)'
                : isCombined
                  ? 'var(--rate-ink-info)'
                  : 'var(--rate-ink-success)',
            }}
          >
            {isFirst ? (
              <BsTrophyFill aria-hidden="true" />
            ) : (
              <BsAwardFill aria-hidden="true" />
            )}
            <span>{titleText}</span>
            <span
              style={{
                opacity: 0.85,
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.8125rem',
              }}
            >
              ({formatDecimal(b.score5, lang, 2)}/{formatDecimal(5, lang, 1)}) ↗
            </span>
          </IntentLink>
        );
      })}
    </div>
  );
}
