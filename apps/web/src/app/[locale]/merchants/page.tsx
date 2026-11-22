import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import { getCachedMerchantsList } from '@/server/rate';
import { withPublicReviewRisk } from '@/server/rate/api-handler';
import {
  hasReviewRiskEvidence,
  knownDosafeRiskScore,
} from '@/lib/merchant-risk-tone';
import PageShell from '../components/page-shell';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import { BsSearch, BsShieldCheck } from 'react-icons/bs';
import MerchantDirectoryExplorer, {
  type MerchantDirectoryExplorerPage,
} from '@/components/merchants/MerchantDirectoryExplorer';
import {
  DEFAULT_MERCHANT_DIRECTORY_FILTERS,
  MERCHANT_PAGE_SIZE,
  pageMerchantDirectory,
  summarizeMerchantDirectory,
  type MerchantDirectoryPage,
} from '@/lib/merchant-directory';
import ClientMessages from '@/components/providers/ClientMessages';

// Cached: the page ships the unfiltered first page, and the explorer applies
// ?q= / ?platform= / ?official= / ?sort= in the browser through the
// directory API, so no request data is read here (DOS/Rate#560).
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'merchants' });
  const canonicalUrl = 'https://rate.vn/merchants';

  return {
    title: t('dirMetaTitle'),
    description: t('dirMetaDesc'),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

function parseServerFiniteNumber(value: unknown): number | null {
  if (
    value == null ||
    (typeof value !== 'number' && typeof value !== 'string')
  ) {
    return null;
  }
  if (typeof value === 'string') {
    if (/\p{Cc}/u.test(value)) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 32 || /^[+-]?0[xbo]/i.test(trimmed)) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? (parsed === 0 ? 0 : parsed) : null;
  }
  return Number.isFinite(value) ? (value === 0 ? 0 : value) : null;
}

function clampServerScore100(value: number): number {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return clamped === 0 ? 0 : clamped;
}

export function toPublicMerchantDirectoryPage(
  page: MerchantDirectoryPage
): MerchantDirectoryExplorerPage {
  return {
    ...page,
    items: page.items.map((m) => {
      const pub = withPublicReviewRisk(m);
      const rawDosafe =
        m.dosafe_risk_known !== false &&
        parseServerFiniteNumber(m.dosafe_risk_score) != null
          ? knownDosafeRiskScore(m)
          : null;
      const brk = m.review_risk_breakdown as { total_reviews?: unknown } | null;
      const parsedCount =
        brk &&
        typeof brk === 'object' &&
        'total_reviews' in brk &&
        brk.total_reviews !== undefined
          ? parseServerFiniteNumber(brk.total_reviews)
          : undefined;
      const reviewKnown =
        hasReviewRiskEvidence(brk) &&
        (parsedCount === undefined || (parsedCount != null && parsedCount > 0));
      const rawReview = reviewKnown
        ? parseServerFiniteNumber(pub.review_risk_score)
        : null;
      return {
        ...pub,
        dosafe_risk_score:
          rawDosafe == null ? null : clampServerScore100(rawDosafe),
        review_risk_score:
          rawReview == null ? null : clampServerScore100(rawReview),
      };
    }),
  };
}

export default async function MerchantsDirectoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'merchants' });
  const merchants = await getCachedMerchantsList();

  // Only the first page and whole-directory stats go to the browser; the
  // explorer fetches further pages and exports from the directory API.
  // Strip internal dosafe_risk_known and baseline scores before RSC serialization
  // (matching /api/v1/rate/merchants/directory, DOS/Rate#1465, #1821).
  const initialPage = toPublicMerchantDirectoryPage(
    pageMerchantDirectory(
      merchants,
      DEFAULT_MERCHANT_DIRECTORY_FILTERS,
      0,
      MERCHANT_PAGE_SIZE
    )
  );
  const summary = summarizeMerchantDirectory(merchants);

  return (
    <ClientMessages scope="merchants">
      <PageShell locale={locale}>
        <div
          className="hero-banner rate-surface-dark rate-ink-on-dark position-relative overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 18% 22%, rgba(216, 48, 48, 0.16), transparent 45%), radial-gradient(circle at 82% 18%, rgba(45, 186, 105, 0.14), transparent 42%), linear-gradient(180deg, #0f1113 0%, #141821 100%)',
            paddingTop: '3.5rem',
            paddingBottom: '3.75rem',
            borderBottom: '1px solid var(--rate-glass-border)',
          }}
        >
          <div className="position-relative z-1 container">
            <div className="row justify-content-center align-items-center">
              <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                <div className="position-relative mt-2 text-start">
                  <span className="rate-eyebrow mb-3">
                    {t('dirHeroBadge1')} · {t('dirHeroBadge2')}
                  </span>
                  <h1
                    className="fw-bold mb-2 text-white"
                    style={{
                      fontSize: 'clamp(1.75rem, 3.2vw, 2.5rem)',
                      letterSpacing: '-0.025em',
                    }}
                  >
                    {t('dirHeroTitle')}
                  </h1>
                  <p
                    className="fs-6 mb-0"
                    style={{
                      color: 'var(--rate-fg-secondary)',
                      maxWidth: '760px',
                    }}
                  >
                    {t('dirHeroSubtitle')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="py-5">
          <div className="container">
            <nav aria-label="breadcrumb" className="mb-4">
              <ol className="breadcrumb small mb-0">
                <li className="breadcrumb-item">
                  <Link href="/" className="text-decoration-none">
                    {t('breadcrumbHome')}
                  </Link>
                </li>
                <li className="breadcrumb-item active" aria-current="page">
                  {t('breadcrumbMerchants')}
                </li>
              </ol>
            </nav>

            {/* Dual Risk Score Explanation Banner */}
            <div className="card rounded-4 bg-light mb-4 border-0 p-4 shadow-sm">
              <div className="row g-3 align-items-center">
                <div className="col-lg-8">
                  <h2 className="h5 fw-bold d-flex align-items-center mb-1 gap-2">
                    <BsShieldCheck className="text-primary" />
                    {t('dualEngineTitle')}
                  </h2>
                  <p className="text-muted small mb-0">
                    {t.rich('dualEngineDesc', {
                      b: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </p>
                </div>
                <div className="col-lg-4 text-lg-end d-flex justify-content-lg-end flex-wrap gap-2">
                  <Link
                    href="/inspect"
                    className="btn btn-danger rounded-pill fw-medium btn-sm px-3"
                  >
                    <BsSearch aria-hidden="true" className="me-1" />
                    {t('inspectUrlBtn')}
                  </Link>
                  <Link
                    href="/smartphones"
                    className="btn btn-outline-primary rounded-pill fw-medium btn-sm px-3"
                  >
                    {t('browseProductsBtn')}
                  </Link>
                </div>
              </div>
            </div>

            <MerchantDirectoryExplorer
              initialPage={initialPage}
              summary={summary}
              locale={locale}
            />
          </div>
        </section>

        <CompareTrayBar />
      </PageShell>
    </ClientMessages>
  );
}
