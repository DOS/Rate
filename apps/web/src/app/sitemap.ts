import type { MetadataRoute } from 'next';
import { env } from '@/env.mjs';
import { getMasterProducts } from '@/lib/rate-api';

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
      priority: 0.9,
    },
    {
      url: `${baseUrl}/compare`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  try {
    const products = await getMasterProducts({ limit: 500 });
    const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
      url: `${baseUrl}/smartphones/${product.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.85,
    }));
    return [...staticEntries, ...productEntries];
  } catch (err) {
    console.error('sitemap: failed to fetch master_products:', err);
    return staticEntries;
  }
}
