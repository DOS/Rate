import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  RATE_CACHE_TAGS,
  categoryCacheTag,
  merchantCacheTag,
  productCacheTag,
} from '@/server/rate';
import { jsonApiError } from '@/server/rate/api-handler';

const REVALIDATE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Rate-Revalidate-Token',
};

const RevalidateRequestSchema = z
  .object({
    tags: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    slugs: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    categories: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
    merchants: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    paths: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(200)
          .refine((p) => p.startsWith('/'), {
            message: 'Path must start with /',
          })
      )
      .max(20)
      .optional(),
  })
  .strict();

function verifyRevalidateSecret(
  providedToken: string | null,
  expectedSecret: string | undefined
): boolean {
  if (!providedToken || !expectedSecret || !expectedSecret.trim()) {
    return false;
  }
  const cleanProvided = providedToken.trim();
  const cleanExpected = expectedSecret.trim();
  if (!cleanProvided || !cleanExpected) {
    return false;
  }
  const digestA = createHash('sha256').update(cleanProvided).digest();
  const digestB = createHash('sha256').update(cleanExpected).digest();
  return timingSafeEqual(digestA, digestB);
}

function extractProvidedToken(request: NextRequest): string | null {
  const headerToken = request.headers.get('x-rate-revalidate-token');
  if (headerToken && headerToken.trim()) {
    return headerToken.trim();
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: REVALIDATE_CORS_HEADERS,
  });
}

export async function POST(request: NextRequest) {
  const expectedSecret =
    process.env.RATE_REVALIDATE_SECRET || process.env.CRON_SECRET;
  const providedToken = extractProvidedToken(request);

  if (!verifyRevalidateSecret(providedToken, expectedSecret)) {
    return jsonApiError(
      401,
      'Unauthorized revalidation token',
      undefined,
      REVALIDATE_CORS_HEADERS
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonApiError(
      400,
      'Invalid JSON request body',
      undefined,
      REVALIDATE_CORS_HEADERS
    );
  }

  const parsed = RevalidateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonApiError(
      400,
      'Invalid revalidation payload: check tags, slugs, categories, merchants, or paths',
      undefined,
      REVALIDATE_CORS_HEADERS
    );
  }

  const tagSet = new Set<string>();
  const pathSet = new Set<string>();

  for (const tag of parsed.data.tags ?? []) {
    tagSet.add(tag);
  }
  for (const slug of parsed.data.slugs ?? []) {
    tagSet.add(productCacheTag(slug));
    tagSet.add(RATE_CACHE_TAGS.PRODUCTS);
    tagSet.add(RATE_CACHE_TAGS.DEALS);
  }
  for (const cat of parsed.data.categories ?? []) {
    tagSet.add(categoryCacheTag(cat));
    tagSet.add(RATE_CACHE_TAGS.CATEGORIES);
  }
  for (const merchantId of parsed.data.merchants ?? []) {
    tagSet.add(merchantCacheTag(merchantId));
    tagSet.add(RATE_CACHE_TAGS.MERCHANTS);
  }
  for (const p of parsed.data.paths ?? []) {
    pathSet.add(p);
  }

  if (tagSet.size === 0 && pathSet.size === 0) {
    return jsonApiError(
      400,
      'At least one tag, slug, category, merchant, or path is required',
      undefined,
      REVALIDATE_CORS_HEADERS
    );
  }

  const revalidatedTags = [...tagSet];
  const revalidatedPaths = [...pathSet];

  for (const tag of revalidatedTags) {
    try {
      revalidateTag(tag, 'max');
    } catch {
      // Outside Next.js static generation runtime (e.g., standalone unit test runner)
    }
  }

  for (const p of revalidatedPaths) {
    try {
      revalidatePath(p);
    } catch {
      // Outside Next.js static generation runtime (e.g., standalone unit test runner)
    }
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        revalidated: true,
        tags: revalidatedTags,
        paths: revalidatedPaths,
        revalidatedAt: new Date().toISOString(),
      },
    },
    {
      status: 200,
      headers: REVALIDATE_CORS_HEADERS,
    }
  );
}
