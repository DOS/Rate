import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ingestExtensionCrowdSignal,
  type SupportedEcommercePlatform,
} from '@/server/rate';
import {
  BoundedSlidingWindowRateLimiter,
  extractClientRateLimitKey,
  isSafeCrowdIngestHttpUrl,
  jsonApiError,
  payloadTooLargeResponse,
  readBoundedJsonBody,
} from '@/server/rate/api-handler';
import { parseEcommerceUrlOrQuery } from '@/lib/rate-api';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Rate-Extension-Version',
};

// platform and externalItemId are optional for callers that only have the
// product URL (the contact-page form, DOS/Rate#615); they are derived from it.
const CrowdIngestSchema = z.object({
  platform: z
    .enum([
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
    ])
    .optional(),
  externalItemId: z.string().trim().min(1).max(120).optional(),
  externalShopId: z.string().trim().max(120).nullish(),
  url: z
    .string()
    .trim()
    .url()
    .max(1024)
    .refine(
      (u) => isSafeCrowdIngestHttpUrl(u),
      'Product URL must use http:// or https:// without embedded credentials'
    ),
  title: z.string().trim().min(3).max(320),
  selectedVariant: z.string().trim().max(160).nullish(),
  price: z.number().int().positive().max(500_000_000),
  originalPrice: z.number().int().positive().max(500_000_000).nullish(),
  ratingStar: z.number().min(0).max(5).nullish(),
  ratingCount: z.number().int().min(0).max(10_000_000).nullish(),
  userConsentOptIn: z.boolean(),
});

// Per-IP sliding window, kept in this serverless instance's memory: each
// warm instance has its own buckets, so it is a best-effort brake, not a
// global per-IP limit. The global bound is the enqueue_crowd_verify_signal
// RPC cap of 120 crowd jobs per minute in total (DOS/Rate#1234).
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
 * - Zod schema validation, a best-effort per-instance IP rate limit and the
 *   DB-side global cap (120 crowd jobs per minute in total)
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
          error:
            'Rate limit exceeded. Too many crowd signals from this address; try again in a minute.',
        },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const bodyRead = await readBoundedJsonBody(request);
    if (bodyRead.tooLarge) return payloadTooLargeResponse(CORS_HEADERS);
    const body: unknown = bodyRead.value;
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
    let platform = payload.platform;
    let externalItemId = payload.externalItemId;
    let externalShopId = payload.externalShopId ?? null;
    if (!platform || !externalItemId) {
      const fromUrl = parseEcommerceUrlOrQuery(payload.url);
      if (
        !fromUrl.platform ||
        fromUrl.platform === 'rate' ||
        !fromUrl.platformItemId ||
        (platform && platform !== fromUrl.platform)
      ) {
        return NextResponse.json(
          {
            ok: true,
            data: {
              accepted: false,
              quarantinedForWorker: false,
              jobState: 'rejected_invalid_url',
              jobId: null,
              reason: 'URL sản phẩm không hợp lệ.',
            },
          },
          { status: 200, headers: CORS_HEADERS }
        );
      }
      platform = fromUrl.platform;
      externalItemId = externalItemId ?? fromUrl.platformItemId;
      externalShopId = externalShopId ?? fromUrl.platformShopId;
    }

    const result = await ingestExtensionCrowdSignal({
      platform: platform as SupportedEcommercePlatform,
      externalItemId,
      externalShopId,
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
