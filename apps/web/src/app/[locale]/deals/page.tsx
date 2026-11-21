import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import type { MasterProduct } from '@repo/shared-data';
import {
  getCachedMasterProducts,
  getCrossPlatformDealRadar,
  groupCatalogRowsByItem,
  type ItemCatalogRow,
} from '@/server/rate';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import PageShell from '../components/page-shell';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import DealFinderWorkspace from '@/components/deals/DealFinderWorkspace';
import ClientMessages from '@/components/providers/ClientMessages';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'deals' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: 'https://rate.vn/deals',
    },
  };
}

export async function loadDealsCatalogProducts(
  readProducts: typeof getCachedMasterProducts = getCachedMasterProducts,
  groupByItem: typeof groupCatalogRowsByItem = groupCatalogRowsByItem
): Promise<MasterProduct[]> {
  const rows = await readProducts({
    categorySlug: 'all',
    limit: 100,
    sort: 'rating_desc',
  });
  // RATE_ITEM_MODEL on: one ranked deal card per Item (DOS/Rate#1155, #1808).
  const grouped = await groupByItem(rows).catch((): ItemCatalogRow[] => rows);
  if (grouped === rows) return rows;
  // DealFinderWorkspace reports max_price - min_price as cross-platform savings
  // for the standing (cheapest) variant, so keep that variant's own max_price
  // rather than the multi-capacity range groupRowsByItem builds for ProductCard.
  const variantById = new Map(rows.map((r) => [r.id, r]));
  return grouped.map((row) => {
    if (!row.item_slug || !row.id) return row;
    const standing = variantById.get(row.id);
    if (!standing) return row;
    const min = Number(row.min_price) || 0;
    const rawStandingMax = Number(standing.max_price);
    const standingMax =
      Number.isFinite(rawStandingMax) && rawStandingMax > 0
        ? Math.max(rawStandingMax, min)
        : min;
    return standingMax === row.max_price
      ? row
      : { ...row, max_price: standingMax };
  });
}

export default async function DealsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'deals' });
  const [products, dealRadar] = await Promise.all([
    loadDealsCatalogProducts(),
    getCrossPlatformDealRadar({
      categorySlug: 'all',
      // Max page size so every ranked card gets its own Radar badge.
      limit: 50,
    }),
  ]);

  return (
    <ClientMessages scope="deals">
      <PageShell locale={locale} mainClassName="bg-light">
        <section className="py-4">
          <div className="container">
            <div className="rate-scoreboard-dark rate-surface-dark rounded-4 mb-4 p-4">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div>
                  <div className="rate-eyebrow mb-2">{t('pageEyebrow')}</div>
                  <h1 className="h3 fw-bold mb-1 text-white">
                    {t('pageTitle')}
                  </h1>
                  <p className="text-white-50 small mb-0">
                    {t('pageSubtitle')}
                  </p>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <Link
                    href="/leaderboard"
                    className="btn btn-sm btn-outline-light rounded-pill px-3"
                  >
                    {t('leaderboardBtn')}
                  </Link>
                  <Link
                    href="/inspect"
                    className="btn btn-sm btn-danger rounded-pill fw-semibold px-3"
                  >
                    {t('inspectBtn')}
                  </Link>
                </div>
              </div>
            </div>

            <DealFinderWorkspace products={products} dealRadar={dealRadar} />
          </div>
        </section>
        <CompareTrayBar />
      </PageShell>
    </ClientMessages>
  );
}
