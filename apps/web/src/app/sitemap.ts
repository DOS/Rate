import type { MetadataRoute } from 'next';
import { env } from '@/env.mjs';
import { createLogger, serializeError } from '@/lib/logger';
import {
  getMasterProductCategorySlug,
  getMasterProductHref,
  getMasterProducts,
  getMerchantsList,
  getRateClient,
} from '@/lib/rate-api';
import {
  buildPopular1v1BattlesForCategory,
  VALID_LEADERBOARD_CATEGORIES,
} from '@/lib/leaderboard-engine';

const log = createLogger('sitemap');
const baseUrl = (env.APP_PUBLIC_URL || 'https://rate.vn').replace(/\/$/, '');

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/smartphones`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/laptops`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tablets`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/smartwatches`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.88,
    },
    {
      url: `${baseUrl}/earbuds`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.88,
    },
    {
      url: `${baseUrl}/deals`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.92,
    },
    {
      url: `${baseUrl}/leaderboard`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.92,
    },
    {
      url: `${baseUrl}/merchants`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.88,
    },
    {
      url: `${baseUrl}/compare`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/watchlist`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/inspect`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/developers`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about-us`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.65,
    },
    {
      url: `${baseUrl}/contact-us`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.65,
    },
  ];

  try {
    const supabase = getRateClient();
    const [products, merchants, catsRes] = await Promise.all([
      getMasterProducts({ categorySlug: 'all', limit: 500 }),
      getMerchantsList({ limit: 200 }),
      supabase.from('categories').select('id, slug'),
    ]);

    const catSlugById = new Map<string, string>();
    for (const c of (catsRes.data || []) as Array<{
      id: string;
      slug: string;
    }>) {
      catSlugById.set(c.id, c.slug);
    }

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

    const productEntries: MetadataRoute.Sitemap = stampedProducts.map(
      (product) => ({
        url: `${baseUrl}${getMasterProductHref(product, catSlugById)}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.85,
      })
    );

    const versusEntries: MetadataRoute.Sitemap =
      VALID_LEADERBOARD_CATEGORIES.flatMap((category) =>
        buildPopular1v1BattlesForCategory(stampedProducts, category, 3).map(
          (pair) => ({
            url: `${baseUrl}${pair.versusHref}`,
            lastModified: now,
            changeFrequency: 'daily' as const,
            priority: 0.83,
          })
        )
      );

    const merchantEntries: MetadataRoute.Sitemap = merchants.map(
      (merchant) => ({
        url: `${baseUrl}/merchants/${merchant.id}`,
        lastModified: merchant.updated_at ? new Date(merchant.updated_at) : now,
        changeFrequency: 'daily',
        priority: 0.82,
      })
    );

    return [
      ...staticEntries,
      ...productEntries,
      ...versusEntries,
      ...merchantEntries,
    ];
  } catch (err) {
    log.error('sitemap dynamic entries failed', { error: serializeError(err) });
    return staticEntries;
  }
}
