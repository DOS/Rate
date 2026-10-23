import type { MetadataRoute } from 'next';
import { env } from '@/env.mjs';
import { createLogger, serializeError } from '@/lib/logger';
import {
  getCachedMasterProducts,
  getCachedSitemapRows,
  getMasterProductCategorySlug,
  getMasterProductHref,
} from '@/server/rate';
import {
  buildPopular1v1BattlesForCategory,
  VALID_LEADERBOARD_CATEGORIES,
} from '@/lib/leaderboard-engine';
import {
  buildSitemapLastModified,
  rowLastModified,
  versusLastModified,
  type SitemapLastModified,
} from '@/lib/sitemap-lastmod';

const log = createLogger('sitemap');
const baseUrl = (env.APP_PUBLIC_URL || 'https://rate.vn').replace(/\/$/, '');

export const revalidate = 3600;

// Which change time a fixed page carries (DOS/Rate#786): 'catalog' pages show
// the newest product change, a category slug the newest change in that
// category, and null pages (info and tools) no lastmod: Google trusts lastmod
// only when it is accurate, and the render time is not.
type StaticDate = 'catalog' | string | null;

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
    date: 'catalog',
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
  dates: SitemapLastModified | null
): MetadataRoute.Sitemap {
  return STATIC_PAGES.map(({ path, date, changeFrequency, priority }) => {
    const lastModified =
      !dates || date === null
        ? undefined
        : date === 'catalog'
          ? dates.latest
          : dates.byCategory.get(date);
    return {
      url: `${baseUrl}${path}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency,
      priority,
    };
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    // Product and merchant URLs come from the whole catalogue; the curated
    // 1v1 battles only need the top-ranked products.
    const [rows, products] = await Promise.all([
      getCachedSitemapRows(),
      getCachedMasterProducts({ categorySlug: 'all', limit: 500 }),
    ]);
    const catSlugById = rows.categorySlugById;

    const dates = buildSitemapLastModified(
      rows.products.map((product) => ({
        slug: product.slug,
        categorySlug: getMasterProductCategorySlug(product, catSlugById),
        updatedAt: product.updated_at,
      }))
    );

    const stampedProducts = products.map((product) => {
      const catSlug = getMasterProductCategorySlug(product, catSlugById);
      return {
        ...product,
        metadata: {
          ...(product.metadata && typeof product.metadata === 'object'
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

    const versusEntries: MetadataRoute.Sitemap =
      VALID_LEADERBOARD_CATEGORIES.flatMap((category) =>
        buildPopular1v1BattlesForCategory(stampedProducts, category, 3).map(
          (pair) => {
            const lastModified = versusLastModified(
              dates,
              pair.productA.slug,
              pair.productB.slug
            );
            return {
              url: `${baseUrl}${pair.versusHref}`,
              ...(lastModified ? { lastModified } : {}),
              changeFrequency: 'daily' as const,
              priority: 0.83,
            };
          }
        )
      );

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

    return [
      ...staticEntries(dates),
      ...productEntries,
      ...versusEntries,
      ...merchantEntries,
    ];
  } catch (err) {
    log.error('sitemap dynamic entries failed', { error: serializeError(err) });
    return staticEntries(null);
  }
}
