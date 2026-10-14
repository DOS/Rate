import type { MetadataRoute } from 'next';
import { env } from '@/env.mjs';
import { getMasterProducts, getMerchantsList } from '@/lib/rate-api';

const baseUrl = (env.APP_PUBLIC_URL || 'https://rate.vn').replace(/\/$/, '');

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
  ];

  try {
    const [products, merchants] = await Promise.all([
      getMasterProducts({ limit: 500 }),
      getMerchantsList({ limit: 200 }),
    ]);

    const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
      url: `${baseUrl}/smartphones/${product.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.85,
    }));

    const merchantEntries: MetadataRoute.Sitemap = merchants.map((merchant) => ({
      url: `${baseUrl}/merchants/${merchant.id}`,
      lastModified: merchant.updated_at ? new Date(merchant.updated_at) : now,
      changeFrequency: 'daily',
      priority: 0.82,
    }));

    return [...staticEntries, ...productEntries, ...merchantEntries];
  } catch (err) {
    console.error('sitemap: failed to fetch dynamic entries:', err);
    return staticEntries;
  }
}
