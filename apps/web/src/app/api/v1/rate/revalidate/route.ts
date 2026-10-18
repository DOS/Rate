import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveRevalidationTargets } from '@/server/rate';
import { createLogger } from '@/lib/logger';
import { jsonApiError } from '@/server/rate/api-handler';

const log = createLogger('api.revalidate');

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
  // Its own secret only: falling back to another job's secret (e.g.
  // CRON_SECRET) would let whoever holds that one purge the cache.
  const expectedSecret = process.env.RATE_REVALIDATE_SECRET;
  if (!expectedSecret?.trim()) {
    // Fail closed, but say so: a 401 here reads as "caller has the wrong
    // token" and hides that the deployment has no secret at all.
    log.error('RATE_REVALIDATE_SECRET is not set; revalidation is disabled');
    return jsonApiError(
      503,
      'Revalidation is not configured',
      undefined,
      REVALIDATE_CORS_HEADERS
    );
  }
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

  const { tags: revalidatedTags, paths: revalidatedPaths } =
    resolveRevalidationTargets(parsed.data);

  if (revalidatedTags.length === 0 && revalidatedPaths.length === 0) {
    return jsonApiError(
      400,
      'At least one tag, slug, category, merchant, or path is required',
      undefined,
      REVALIDATE_CORS_HEADERS
    );
  }

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
