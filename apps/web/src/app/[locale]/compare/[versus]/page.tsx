import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BsTrophy } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import {
  getCachedCompareMasterProducts,
  getCachedMasterProducts,
  getMasterProductCategorySlug,
  getMasterProductHref,
} from '@/server/rate';
import { resolveVersusPlan } from '@/server/rate/item-compare';
import {
  canonicalVersusOrder,
  inPairOrder,
  versusAliasRedirect,
} from '@/lib/item-compare';
import { getItemSlugsFor } from '@/server/rate/item-directory';
import { normalizeRateLocale } from '@/lib/rate-i18n';
import { defaultOpenGraph, fitTitle, fitDescription } from '@/lib/seo';
import { scoreMasterProductForLeaderboard } from '@/lib/leaderboard-engine';
import PageShell from '../../components/page-shell';
import CompareWorkspace from '@/components/compare/CompareWorkspace';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import VersusInteractiveScoreboard from '@/components/compare/VersusInteractiveScoreboard';
import VersusMatchupSwitcher from '@/components/compare/VersusMatchupSwitcher';
import ClientMessages from '@/components/providers/ClientMessages';

export const revalidate = 60;

// Nothing is prerendered at build; each versus renders on its first request.
export function generateStaticParams(): { versus: string }[] {
  return [];
}

interface VersusPageProps {
  params: Promise<{ locale: string; versus: string }>;
}

/**
 * The two slugs of a versus URL, lower-cased, or with their case kept for the
 * catalogue lookup (Item slugs are matched exactly, DOS/Rate#1383).
 */
export function parseVersusSlugs(
  rawVersus: string,
  keepCase = false
): [string, string] | null {
  const decoded = decodeURIComponent(rawVersus || '').trim();
  const cleaned = keepCase ? decoded : decoded.toLowerCase();
  const parts = cleaned.split('-vs-');
  if (parts.length !== 2) return null;
  const slugA = parts[0]?.trim() || '';
  const slugB = parts[1]?.trim() || '';
  if (!slugA || !slugB || slugA === slugB) return null;
  return [slugA, slugB];
}

export async function generateMetadata({
  params,
}: VersusPageProps): Promise<Metadata> {
  const { locale, versus } = await params;
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'compare' });
  // Both cases below render the 404 page, so they are titled as one
  // (DOS/Rate#877).
  const notFoundMeta = async (): Promise<Metadata> => {
    const tNotFound = await getTranslations({
      locale: lang,
      namespace: 'errors.notFound',
    });
    return { title: `${tNotFound('title')} | Rate.vn` };
  };
  const parsed = parseVersusSlugs(versus);
  if (!parsed) {
    return notFoundMeta();
  }

  // RATE_ITEM_MODEL on: the Item pair is the page (DOS/Rate#1156).
  // The Item lookup is exact: the slugs go as typed, each side falling back
  // to lower case (DOS/Rate#1383).
  const asTyped = parseVersusSlugs(versus, true) ?? parsed;
  const plan = await resolveVersusPlan(asTyped[0], asTyped[1]);
  if (plan && plan.kind !== 'render') {
    return notFoundMeta();
  }
  // Master-product route: the canonical order, whichever way the URL named
  // the pair (the other order 308s there, #1367).
  const pair = plan
    ? [plan.slugA, plan.slugB]
    : canonicalVersusOrder(parsed[0], parsed[1]);
  const compared = await getCachedCompareMasterProducts(pair.join(','));
  const [a, b] = inPairOrder(compared, pair);
  if (!a || !b) {
    return notFoundMeta();
  }

  const canonicalUrl = plan
    ? `https://rate.vn${plan.canonical}`
    : `https://rate.vn/compare/${pair[0]}-vs-${pair[1]}`;
  const fullTitle = t('versusMetaTitle', { nameA: a.name, nameB: b.name });
  // Both names first; the fixed text, then the site name, give way to fit a
  // search result (DOS/Rate#777). The share card keeps the full title.
  const title = fitTitle([
    fullTitle,
    t('versusMetaTitleShort', { nameA: a.name, nameB: b.name }),
    `${a.name} vs ${b.name}`,
  ]);
  const description = fitDescription(
    t('versusMetaDescription', {
      nameA: a.name,
      nameB: b.name,
    })
  );

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      ...defaultOpenGraph(lang),
      title: fullTitle,
      description,
      url: canonicalUrl,
    },
  };
}

export default async function VersusComparePage({ params }: VersusPageProps) {
  const { locale, versus } = await params;
  setRequestLocale(locale);
  const lang = normalizeRateLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'compare' });
  const parsed = parseVersusSlugs(versus);
  if (!parsed) {
    notFound();
  }

  // RATE_ITEM_MODEL on: versus URLs name Items, an old variant pair 308s to
  // its Item pair and a same-Item pair is no versus (DOS/Rate#1156); off:
  // null, and the page is as before.
  // The Item lookup is exact: the slugs go as typed, each side falling back
  // to lower case (DOS/Rate#1383).
  const asTyped = parseVersusSlugs(versus, true) ?? parsed;
  const plan = await resolveVersusPlan(asTyped[0], asTyped[1]);
  if (plan?.kind === 'redirect') permanentRedirect(plan.to);
  if (plan?.kind === 'not_found') notFound();
  // One URL per pair, its slugs sorted: the other order, letter case or
  // encoding 308s there, on either route (#1367).
  const canonicalPath =
    plan?.kind === 'render'
      ? plan.canonical
      : `/compare/${canonicalVersusOrder(parsed[0], parsed[1]).join('-vs-')}`;
  const aliasHref = versusAliasRedirect(versus, canonicalPath);
  if (aliasHref) permanentRedirect(aliasHref);
  // The page shows the pair in the canonical order its metadata uses, also
  // when the URL was not redirected (a slug that is no plain catalogue slug).
  const pair =
    plan?.kind === 'render'
      ? [plan.slugA, plan.slugB]
      : canonicalVersusOrder(parsed[0], parsed[1]);

  const [compared, directory] = await Promise.all([
    getCachedCompareMasterProducts(pair.join(',')),
    getCachedMasterProducts({
      categorySlug: 'all',
      limit: 60,
      sort: 'rating_desc',
    }),
  ]);

  if (compared.length < 2 || !compared[0] || !compared[1]) {
    notFound();
  }

  const [prodA, prodB] = inPairOrder(compared, pair);
  if (!prodA || !prodB) {
    notFound();
  }
  const catSlug = getMasterProductCategorySlug(prodA);
  const scoreA = scoreMasterProductForLeaderboard(prodA, 'combined');
  const scoreB = scoreMasterProductForLeaderboard(prodB, 'combined');
  // RATE_ITEM_MODEL on: in-app versus links name Items (DOS/Rate#1290).
  const itemSlugBySlug = await getItemSlugsFor([
    ...compared.map((p) => p.slug),
    ...directory.map((p) => p.slug),
  ]);
  const itemSlugProps = itemSlugBySlug ? { itemSlugBySlug } : {};

  // Summary ItemList: each item links to its product page, which carries the
  // Product markup (DOS/Rate#1059).
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${prodA.name} vs ${prodB.name}`,
    numberOfItems: 2,
    itemListElement: [scoreA, scoreB].map((entry, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: entry.name,
      url: `https://rate.vn${getMasterProductHref(entry.product)}`,
    })),
  };

  return (
    <ClientMessages scope="compare">
      <PageShell locale={locale}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListSchema).replace(/</g, '\\u003c'),
          }}
        />

        {/* DESIGN.md v3.0 1v1 Head-to-Head Hero Scoreboard */}
        <section
          className="rate-surface-dark rate-ink-on-dark"
          style={{
            background:
              'linear-gradient(135deg, #0b0d10 0%, #12161f 55%, #181c26 100%)',
            color: 'var(--rate-fg-primary)',
            padding: '40px 0 36px',
            borderBottom: '1px solid var(--rate-glass-border)',
          }}
        >
          <div className="container">
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <span
                className="badge rounded-pill px-3 py-2"
                style={{
                  background: 'rgba(216, 48, 48, 0.16)',
                  border: '1px solid rgba(216, 48, 48, 0.4)',
                  color: 'var(--rate-crimson-text)',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                }}
              >
                {/* 1V1 HEAD-TO-HEAD AUDIT */}
                {t('versusHeroBadge', { category: catSlug.toUpperCase() })}
              </span>
              <Link
                href={`/leaderboard?cat=${catSlug}`}
                className="btn btn-sm btn-outline-light rounded-pill px-3"
              >
                <BsTrophy aria-hidden="true" className="me-1" />
                {t('viewCategoryLeaderboard')}
              </Link>
            </div>

            <h1
              className="fw-bold mb-2 text-white"
              style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.25rem)' }}
            >
              {scoreA.name} <span className="text-danger mx-1">vs</span>{' '}
              {scoreB.name}
            </h1>

            <VersusInteractiveScoreboard
              scoreA={scoreA}
              scoreB={scoreB}
              locale={locale}
            />

            <VersusMatchupSwitcher
              currentSlugA={scoreA.slug}
              currentSlugB={scoreB.slug}
              categorySlug={catSlug}
              catalogCandidates={directory}
              locale={locale}
              {...itemSlugProps}
            />
          </div>
        </section>

        <section className="bg-light py-5">
          <div className="container">
            <CompareWorkspace
              initialProducts={[prodA, prodB]}
              catalogCandidates={directory}
              initialCategory={catSlug}
              hasExplicitSlugs={true}
              locale={locale}
              {...itemSlugProps}
            />
          </div>
        </section>

        <CompareTrayBar />
      </PageShell>
    </ClientMessages>
  );
}
