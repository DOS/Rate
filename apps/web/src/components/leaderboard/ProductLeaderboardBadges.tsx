import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import type { CanonicalCategorySlug } from '@/lib/rate-domain';
import type {
  LeaderboardCriterionKey,
  ProductLeaderboardBadgeInfo,
} from '@/lib/leaderboard-engine';
import { BsTrophyFill } from 'react-icons/bs';

interface ProductLeaderboardBadgesProps {
  badges: ProductLeaderboardBadgeInfo[];
  locale?: string;
}

export default async function ProductLeaderboardBadges({
  badges,
  locale,
}: ProductLeaderboardBadgesProps) {
  if (!badges || badges.length === 0) {
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
        borderTop: '1px solid rgba(255,255,255,0.09)',
      }}
    >
      <span
        className="d-inline-flex align-items-center fw-semibold gap-1"
        style={{
          fontSize: '0.8125rem',
          color: '#cbd5e1',
          letterSpacing: '0.02em',
        }}
      >
        <BsTrophyFill className="text-warning" />
        {sectionLabel}
      </span>

      {badges.map((b) => {
        const isFirst = b.rank === 1;
        const isCombined = b.criterion === 'combined';
        const titleText = isCombined
          ? `#${b.rank}/${b.totalInCategory} ${catNames[b.categorySlug]}`
          : `#${b.rank} ${critLabels[b.criterion]}`;

        return (
          <Link
            key={`${b.categorySlug}-${b.criterion}`}
            href={`/leaderboard?cat=${b.categorySlug}&criterion=${b.criterion}`}
            className="text-decoration-none d-inline-flex align-items-center rounded-pill gap-1 px-3 py-1"
            style={{
              fontSize: '0.8125rem',
              fontWeight: 700,
              background: isFirst
                ? 'linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(255,46,41,0.22) 100%)'
                : isCombined
                  ? 'rgba(56,189,248,0.16)'
                  : 'rgba(16,185,129,0.15)',
              border: isFirst
                ? '1px solid rgba(251,191,36,0.55)'
                : isCombined
                  ? '1px solid rgba(56,189,248,0.38)'
                  : '1px solid rgba(16,185,129,0.35)',
              color: isFirst ? '#fde68a' : isCombined ? '#7dd3fc' : '#6ee7b7',
            }}
          >
            <span>
              {isFirst
                ? '🥇'
                : b.rank === 2
                  ? '🥈'
                  : b.rank === 3
                    ? '🥉'
                    : '🏅'}
            </span>
            <span>{titleText}</span>
            <span
              style={{
                opacity: 0.85,
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.8125rem',
              }}
            >
              ({b.score5.toFixed(2)}/5.0) ↗
            </span>
          </Link>
        );
      })}
    </div>
  );
}
