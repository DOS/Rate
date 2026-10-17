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

const CATEGORY_NAMES: Record<
  'vi' | 'en' | 'cs',
  Record<CanonicalCategorySlug, string>
> = {
  vi: {
    smartphones: 'Điện thoại',
    tablets: 'Máy tính bảng',
    laptops: 'Laptop',
    smartwatches: 'Đồng hồ thông minh',
    earbuds: 'Tai nghe',
  },
  en: {
    smartphones: 'Smartphones',
    tablets: 'Tablets',
    laptops: 'Laptops',
    smartwatches: 'Smartwatches',
    earbuds: 'Earbuds',
  },
  cs: {
    smartphones: 'Smartphony',
    tablets: 'Tablety',
    laptops: 'Notebooky',
    smartwatches: 'Chytré hodinky',
    earbuds: 'Sluchátka',
  },
};

const CRITERION_LABELS: Record<
  'vi' | 'en' | 'cs',
  Record<LeaderboardCriterionKey, string>
> = {
  vi: {
    combined: 'Tổng hợp JReviews',
    user: 'Người dùng thật',
    expert: 'Chuyên gia Lab',
    screen: 'Màn hình',
    performance: 'Hiệu năng',
    camera: 'Camera / Âm thanh',
    battery: 'Pin & Sạc',
    value: 'Đáng tiền (P/P)',
  },
  en: {
    combined: 'Overall JReviews',
    user: 'Verified Users',
    expert: 'Lab Experts',
    screen: 'Display',
    performance: 'Performance',
    camera: 'Camera / Audio',
    battery: 'Battery & Charge',
    value: 'Value (P/P)',
  },
  cs: {
    combined: 'Celkově JReviews',
    user: 'Ověření uživatelé',
    expert: 'Experti Lab',
    screen: 'Displej',
    performance: 'Výkon',
    camera: 'Fotoaparát / Zvuk',
    battery: 'Baterie a nabíjení',
    value: 'Poměr cena/výkon',
  },
};

export default function ProductLeaderboardBadges({
  badges,
  locale,
}: ProductLeaderboardBadgesProps) {
  if (!badges || badges.length === 0) {
    return null;
  }

  const lang = normalizeRateLocale(locale);
  const catNames = CATEGORY_NAMES[lang];
  const critLabels = CRITERION_LABELS[lang];

  const sectionLabel =
    lang === 'en'
      ? 'Category Leaderboard Standing:'
      : lang === 'cs'
        ? 'Umístění v žebříčku kategorie:'
        : 'Thứ hạng trong Bảng xếp hạng danh mục:';

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
          fontSize: '12px',
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
              fontSize: '12px',
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
                fontSize: '11px',
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
