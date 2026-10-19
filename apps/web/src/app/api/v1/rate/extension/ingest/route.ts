import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ingestExtensionCrowdSignal,
  type SupportedEcommercePlatform,
} from '@/server/rate';
import {
  BoundedSlidingWindowRateLimiter,
  extractClientRateLimitKey,
  jsonApiError,
} from '@/server/rate/api-handler';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Rate-Extension-Version',
};

const CrowdIngestSchema = z.object({
  platform: z.enum([
    'shopee',
    'lazada',
    'tiki',
    'tiktok',
    'cellphones',
    'tgdd',
    'fptshop',
    'hoangha',
    'didongviet',
    'phongvu',
  ]),
  externalItemId: z.string().trim().min(1).max(120),
  externalShopId: z.string().trim().max(120).nullish(),
  url: z
    .string()
    .trim()
    .url()
    .max(1024)
    .refine(
      (u) => /^https?:\/\//i.test(u),
      'Product URL must use http:// or https://'
    ),
  title: z.string().trim().min(3).max(320),
  selectedVariant: z.string().trim().max(160).nullish(),
  price: z.number().int().positive().max(500_000_000),
  originalPrice: z.number().int().positive().max(500_000_000).nullish(),
  ratingStar: z.number().min(0).max(5).nullish(),
  ratingCount: z.number().int().min(0).max(10_000_000).nullish(),
  userConsentOptIn: z.boolean(),
});

// Bounded per-IP sliding window rate limiter for crowd ingest quarantine
const ingestRateLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 15,
  maxBuckets: 2_000,
});

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * POST /api/v1/rate/extension/ingest
 * Zero-Trust Crowdsourced Signal Quarantine Endpoint (Two-Speed Hybrid Architecture v2).
 * Enforces:
 * - Explicit Opt-In Consent check (`userConsentOptIn === true`)
 * - Zod schema validation & sliding-window IP rate limit + DB-side global rate limit
 * - Accessory / Junk Gatekeeper
 * - Platform Capability Matrix check (only queues platforms with active verification workers)
 * - 100% Quarantine: Enqueues into `rate.crawl_jobs` via narrow `enqueue_crowd_verify_signal` RPC without `service_role`; NEVER mutates canonical prices directly.
 */
export async function POST(request: NextRequest) {
  try {
    const clientIp = extractClientRateLimitKey(request.headers);

    if (!ingestRateLimiter.allow(clientIp)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Rate limit exceeded. Maximum 15 crowd signals per minute.',
        },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = CrowdIngestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid crowd signal payload.',
          details: parsed.error.flatten(),
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const payload = parsed.data;
    const result = await ingestExtensionCrowdSignal({
      platform: payload.platform as SupportedEcommercePlatform,
      externalItemId: payload.externalItemId,
      externalShopId: payload.externalShopId ?? null,
      url: payload.url,
      title: payload.title,
      selectedVariant: payload.selectedVariant ?? null,
      price: payload.price,
      originalPrice: payload.originalPrice ?? null,
      ratingStar: payload.ratingStar ?? null,
      ratingCount: payload.ratingCount ?? null,
      userConsentOptIn: payload.userConsentOptIn,
    });

    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return jsonApiError(
      500,
      'Failed to process extension crowd signal.',
      error,
      CORS_HEADERS
    );
  }
}
