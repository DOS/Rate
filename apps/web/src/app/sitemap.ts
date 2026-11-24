import type { MetadataRoute } from 'next';
import {
  canonicalVersusOrder,
  isParseableVersusPair,
  itemSlugFromProductAnswer,
  versusHref,
} from '@/lib/item-compare';
import { env } from '@/env.mjs';
import { createLogger, serializeError } from '@/lib/logger';
import {
  getCachedMasterProducts,
  getCachedSitemapRows,
  getMasterProductCategorySlug,
  getMasterProductHref,
  sanitizeCachedProductSlug,
} from '@/server/rate';
import {
  buildPopular1v1BattlesForCategory,
  rankMasterProductsForLeaderboard,
  VALID_LEADERBOARD_CATEGORIES,
} from '@/lib/leaderboard-engine';
import type { CanonicalCategorySlug } from '@/lib/rate-domain-core';
import {
  buildSitemapLastModified,
  newestOf,
  rowLastModified,
  versusLastModified,
  type SitemapLastModified,
} from '@/lib/sitemap-lastmod';

const log = createLogger('sitemap');
const baseUrl = (env.APP_PUBLIC_URL || 'https://rate.vn').replace(/\/$/, '');

export const revalidate = 3600;

// Which change time a fixed page carries (DOS/Rate#786): 'catalog' pages show
// the newest product change, 'merchants' the newest product or store change,
// a category slug the newest change in that category, and null pages (info
// and tools) no lastmod: Google trusts lastmod only when it is accurate, and
// the render time is not.
type StaticDate = 'catalog' | 'merchants' | CanonicalCategorySlug | null;

const STATIC_PAGES: Array<{
  path: string;
  date: StaticDate;
  changeFrequency: NonNullable<
    MetadataRoute.Sitemap[number]['changeFrequency']
  >;
  priority: number;
}> = [
  { path: '/', date: 'catalog', changeFrequency: 'daily', priority: 1.0 },
  {
    path: '/smartphones',
    date: 'smartphones',
    changeFrequency: 'hourly',
    priority: 0.95,
  },
  {
    path: '/laptops',
    date: 'laptops',
    changeFrequency: 'daily',
    priority: 0.9,
  },
  {
    path: '/tablets',
    date: 'tablets',
    changeFrequency: 'daily',
    priority: 0.9,
  },
  {
    path: '/smartwatches',
    date: 'smartwatches',
    changeFrequency: 'daily',
    priority: 0.88,
  },
  {
    path: '/earbuds',
    date: 'earbuds',
    changeFrequency: 'daily',
    priority: 0.88,
  },
  {
    path: '/deals',
    date: 'catalog',
    changeFrequency: 'hourly',
    priority: 0.92,
  },
  {
    path: '/leaderboard',
    date: 'catalog',
    changeFrequency: 'daily',
    priority: 0.92,
  },
  {
    path: '/merchants',
    date: 'merchants',
    changeFrequency: 'daily',
    priority: 0.88,
  },
  {
    path: '/compare',
    date: 'catalog',
    changeFrequency: 'daily',
    priority: 0.85,
  },
  { path: '/watchlist', date: null, changeFrequency: 'daily', priority: 0.8 },
  { path: '/inspect', date: null, changeFrequency: 'daily', priority: 0.85 },
  { path: '/developers', date: null, changeFrequency: 'weekly', priority: 0.8 },
  { path: '/about-us', date: null, changeFrequency: 'monthly', priority: 0.7 },
  { path: '/faq', date: null, changeFrequency: 'monthly', priority: 0.7 },
  {
    path: '/privacy-policy',
    date: null,
    changeFrequency: 'monthly',
    priority: 0.65,
  },
  {
    path: '/contact-us',
    date: null,
    changeFrequency: 'monthly',
    priority: 0.65,
  },
];

function staticEntries(
  dates: SitemapLastModified | null,
  latestMerchant?: Date
): MetadataRoute.Sitemap {
  const populatedWavePages = VALID_LEADERBOARD_CATEGORIES.filter(
    (cat) =>
      cat !== 'smartphones' &&
      cat !== 'laptops' &&
      cat !== 'tablets' &&
      cat !== 'smartwatches' &&
      cat !== 'earbuds' &&
      Boolean(dates?.byCategory.get(cat))
  ).map((cat) => ({
    path: `/${cat}`,
    date: cat as StaticDate,
    changeFrequency: 'daily' as const,
    priority: 0.85,
  }));

  return [...STATIC_PAGES, ...populatedWavePages].map(
    ({ path, date, changeFrequency, priority }) => {
      const lastModified =
        !dates || date === null
          ? undefined
          : date === 'catalog'
            ? dates.latest
            : date === 'merchants'
              ? newestOf(dates.latest, latestMerchant)
              : dates.byCategory.get(date);
      return {
        url: `${baseUrl}${path}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency,
        priority,
      };
    }
  );
}

function isSafeVersusSlug(slug: string): boolean {
  return (
    Boolean(slug) &&
    !slug.toLowerCase().includes('-vs-') &&
    itemSlugFromProductAnswer({ ok: true, data: { item: { slug } } }, '') ===
      slug
  );
}

function isValidMasterCatalogSlug(slug: string): boolean {
  return slug.length > 0 && sanitizeCachedProductSlug(slug) === slug;
}

function isValidMasterVersusSlug(slug: string): boolean {
  return isValidMasterCatalogSlug(slug) && isSafeVersusSlug(slug);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    // Product and merchant URLs come from the whole catalogue; the curated
    // 1v1 battles only need the top-ranked products.
    const [rows, products] = await Promise.all([
      getCachedSitemapRows(),
      getCachedMasterProducts({ categorySlug: 'all', limit: 500 }),
    ]);
    // RATE_ITEM_MODEL on: versus pairs name Items with the map the product
    // URLs were built from (DOS/Rate#1156, #1275); off: null.
    const itemSlugs = rows.itemSlugByVariantSlug ?? null;
    const catSlugById = rows.categorySlugById;

    const variantsByItemSlug = new Map<string, string[]>();
    const itemSlugBySlug: Record<string, string> | null = itemSlugs
      ? (Object.create(null) as Record<string, string>)
      : null;
    if (itemSlugs && itemSlugBySlug) {
      for (const [variantSlug, itemSlug] of itemSlugs) {
        if (!variantSlug || !itemSlug) continue;
        if (variantSlug !== '__proto__') {
          itemSlugBySlug[variantSlug] = itemSlug;
        }
        const list = variantsByItemSlug.get(itemSlug);
        if (list) list.push(variantSlug);
        else variantsByItemSlug.set(itemSlug, [variantSlug]);
      }
    }

    const dates = buildSitemapLastModified(
      rows.products.map((product) => ({
        slug: product.slug,
        fallbackSlugs: variantsByItemSlug.get(product.slug),
        categorySlug: getMasterProductCategorySlug(product, catSlugById),
        updatedAt: product.updated_at,
      }))
    );

    const stampedProducts = products.map((product) => {
      const catSlug = getMasterProductCategorySlug(product, catSlugById);
      return {
        ...product,
        metadata: {
          ...(product.metadata &&
          typeof product.metadata === 'object' &&
          !Array.isArray(product.metadata)
            ? product.metadata
            : {}),
          category_slug: catSlug,
        },
      };
    });

    const productEntries: MetadataRoute.Sitemap = rows.products.map(
      (product) => {
        const lastModified = rowLastModified(product.updated_at);
        return {
          url: `${baseUrl}${getMasterProductHref(product, catSlugById)}`,
          ...(lastModified ? { lastModified } : {}),
          changeFrequency: 'daily',
          priority: 0.85,
        };
      }
    );

    const versusSeen = new Set<string>();
    const versusEntries: MetadataRoute.Sitemap =
      VALID_LEADERBOARD_CATEGORIES.flatMap((category) => {
        // Deduplicate category candidates per Item (when RATE_ITEM_MODEL is
        // active) and per case-insensitive side slug before pairing, so
        // multi-size Items do not pair with themselves and starve the 3
        // curated 1v1 slots (DOS/Rate#1822).
        const ranked = rankMasterProductsForLeaderboard(stampedProducts, {
          category,
          criterion: 'combined',
        });
        const seenItemKeys = new Set<string>();
        const seenSideKeys = new Set<string>();
        const sideByVariantSlug = new Map<
          string,
          { side: string; mappedItemSlug?: string }
        >();
        const categoryCandidates: typeof products = [];

        for (const entry of ranked) {
          const variantSlug = entry.slug;
          if (!variantSlug) continue;
          const mappedItemSlug = itemSlugs
            ? (itemSlugs.get(entry.product.slug) ?? itemSlugs.get(variantSlug))
            : undefined;
          // An Item whose stored slug holds "-vs-" has no versus route (#1275),
          // even when versusHref would fall back to the variant slug.
          if (
            typeof mappedItemSlug === 'string' &&
            mappedItemSlug.toLowerCase().includes('-vs-')
          ) {
            continue;
          }
          const hasSafeItemSlug =
            typeof mappedItemSlug === 'string' &&
            isSafeVersusSlug(mappedItemSlug);
          if (hasSafeItemSlug) {
            // Canonical Item URLs may preserve mixed case (#1383), provided the
            // variant row itself has a valid lowercase master slug for
            // getCachedCompareMasterProducts on /compare/[versus].
            if (!isValidMasterCatalogSlug(variantSlug)) {
              continue;
            }
          } else if (!isValidMasterVersusSlug(variantSlug)) {
            // Variant mode, unlinked rows, and fallback variant URLs must be
            // exact lowercase master slugs without "-vs-" so /compare/[versus]
            // neither 308s nor 404s.
            continue;
          }
          const effectiveSide = hasSafeItemSlug ? mappedItemSlug : variantSlug;
          const itemKey = mappedItemSlug ? mappedItemSlug.toLowerCase() : null;
          const sideKey = effectiveSide.toLowerCase();
          if (
            (itemKey && seenItemKeys.has(itemKey)) ||
            seenSideKeys.has(sideKey)
          ) {
            continue;
          }
          if (itemKey) seenItemKeys.add(itemKey);
          seenSideKeys.add(sideKey);
          if (itemSlugBySlug && mappedItemSlug && variantSlug !== '__proto__') {
            itemSlugBySlug[variantSlug] = mappedItemSlug;
          }
          sideByVariantSlug.set(variantSlug, {
            side: effectiveSide,
            ...(mappedItemSlug ? { mappedItemSlug } : {}),
          });
          categoryCandidates.push(entry.product);
        }

        const categoryEntries: MetadataRoute.Sitemap = [];
        for (const pair of buildPopular1v1BattlesForCategory(
          categoryCandidates,
          category,
          20
        )) {
          if (categoryEntries.length >= 3) break;
          const variantSlugA = pair.productA.slug;
          const variantSlugB = pair.productB.slug;
          const resolvedA = sideByVariantSlug.get(variantSlugA);
          const resolvedB = sideByVariantSlug.get(variantSlugB);
          if (!resolvedA || !resolvedB) continue;

          // Build canonical 1v1 URL via versusHref and enforce parseable /
          // case-insensitive duplicate guards in both Item and variant modes
          // (DOS/Rate#1367, #1768, #1822).
          const href = versusHref(variantSlugA, variantSlugB, itemSlugBySlug);
          const [firstSlug, secondSlug] = canonicalVersusOrder(
            resolvedA.side,
            resolvedB.side
          );
          const pairKey = [firstSlug.toLowerCase(), secondSlug.toLowerCase()]
            .sort()
            .join('|');
          if (
            href !== `/compare/${firstSlug}-vs-${secondSlug}` ||
            firstSlug.toLowerCase() === secondSlug.toLowerCase() ||
            versusSeen.has(pairKey) ||
            !isSafeVersusSlug(firstSlug) ||
            !isSafeVersusSlug(secondSlug) ||
            firstSlug.toLowerCase().includes('-vs-') ||
            secondSlug.toLowerCase().includes('-vs-') ||
            !isParseableVersusPair(firstSlug, secondSlug)
          ) {
            continue;
          }
          versusSeen.add(pairKey);
          const lastModified = versusLastModified(
            dates,
            [resolvedA.side, resolvedA.mappedItemSlug, variantSlugA],
            [resolvedB.side, resolvedB.mappedItemSlug, variantSlugB]
          );
          categoryEntries.push({
            url: `${baseUrl}${href}`,
            ...(lastModified ? { lastModified } : {}),
            changeFrequency: 'daily',
            priority: 0.83,
          });
        }
        return categoryEntries;
      });

    const merchantEntries: MetadataRoute.Sitemap = rows.merchants.map(
      (merchant) => {
        const lastModified = rowLastModified(merchant.updated_at);
        return {
          url: `${baseUrl}/merchants/${merchant.id}`,
          ...(lastModified ? { lastModified } : {}),
          changeFrequency: 'daily',
          priority: 0.82,
        };
      }
    );

    // A reduce, not a spread: one argument per merchant could overflow the stack.
    const latestMerchant = rows.merchants.reduce<Date | undefined>(
      (acc, merchant) => newestOf(acc, rowLastModified(merchant.updated_at)),
      undefined
    );

    return [
      ...staticEntries(dates, latestMerchant),
      ...productEntries,
      ...versusEntries,
      ...merchantEntries,
    ];
  } catch (err) {
    log.error('sitemap dynamic entries failed', { error: serializeError(err) });
    return staticEntries(null);
  }
}
