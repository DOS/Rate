import { env } from '@/env.mjs';

import type { MetadataRoute } from 'next';

import { isProduction } from '@/lib/general-helpers';

const baseUrl = env.APP_PUBLIC_URL;

export default function robots(): MetadataRoute.Robots {
  return isProduction()
    ? {
        rules: {
          userAgent: '*',
          allow: ['/', '/llms.txt', '/.well-known/mcp.json', '/api/mcp'],
        },
        sitemap: new URL('sitemap.xml', baseUrl).toString(),
      }
    : {
        rules: {
          userAgent: '*',
          disallow: '/',
        },
      };
}
