import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { ReviewFlagCategory, ReviewItem } from '@/lib/rate-api';
import {
  authenticateRateRequest,
  isMissingRpcError,
  mapRpcRejection,
  type RpcRejection,
} from '@/server/rate/request-auth';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api.reviews');

const CRITERIA_KEYS = [
  'screen',
  'performance',
  'camera',
  'battery',
  'value',
] as const;

// Unknown fields (including a client-sent `reviewerType`) are stripped: the reviewer
// type is decided by the database, never by the request body.
const SubmitReviewSchema = z.object({
  masterProductId: z
    .string()
    .trim()
    .uuid('Mã sản phẩm chuẩn hóa (masterProductId) không hợp lệ.'),
  authorName: z.string().optional(),
  ratingStar: z.coerce.number().optional(),
  comment: z
    .string()
    .trim()
    .min(15, 'Nội dung đánh giá phải có độ dài từ 15 đến 3.000 ký tự.')
    .max(3000, 'Nội dung đánh giá phải có độ dài từ 15 đến 3.000 ký tự.'),
  variation: z.string().optional(),
  criteriaRatings: z.record(z.string(), z.unknown()).optional(),
});

const FLAG_CATEGORIES = new Set<ReviewFlagCategory>([
  'authentic',
  'low_value_coin_spam',
  'seeding_fake',
  'competitor_sabotage',
  'review_bombing',
]);

// SQLSTATEs raised deliberately by rate.submit_community_review
// (DOS-Me 20261014234500 and the auth gate in 20261017120000).
const RPC_REJECTIONS: Record<string, RpcRejection> = {
  // invalid length / stars / product id
  '22023': {
    status: 400,
    code: 'REJECTED',
    error: 'Dữ liệu đánh giá không hợp lệ.',
  },
  // no listing for this master product
  P0002: {
    status: 400,
    code: 'REJECTED',
    error: 'Sản phẩm này chưa có nơi bán để gắn đánh giá.',
  },
  // not signed in, or a Supabase anonymous sign-in
  '42501': {
    status: 403,
    code: 'FORBIDDEN',
    error: 'Bạn cần đăng nhập bằng tài khoản thật để gửi đánh giá.',
  },
  // one review per user and product
  '23505': {
    status: 409,
    code: 'DUPLICATE_REVIEW',
    error: 'Bạn đã gửi đánh giá cho sản phẩm này.',
  },
  // more than 5 reviews in 24h
  '54000': {
    status: 429,
    code: 'RATE_LIMITED',
    error: 'Bạn đã gửi quá 5 đánh giá trong 24 giờ, vui lòng thử lại sau.',
  },
};

function sanitizeCriteria(raw: Record<string, unknown> | undefined) {
  const out: Record<string, number> = {};
  for (const key of CRITERIA_KEYS) {
    const val = Number(raw?.[key]);
    if (Number.isFinite(val) && val >= 1 && val <= 5) {
      out[key] = Math.round(val * 10) / 10;
    }
  }
  return out;
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Builds the response item from what rate.submit_community_review stored, so the
 * verdict and weight shown to the user are the ones the database applied.
 */
function toReviewItem(
  record: Record<string, unknown>,
  criteria: Record<string, number>
): ReviewItem {
  const verdict = record.verdict;
  const flag = record.flag_category as ReviewFlagCategory;
  return {
    id: String(record.id),
    author_name: String(record.author_name ?? ''),
    rating_star: asNumber(record.rating_star, 0),
    comment: String(record.comment ?? ''),
    variation: typeof record.variation === 'string' ? record.variation : null,
    created_at:
      typeof record.created_at === 'string'
        ? record.created_at
        : new Date().toISOString(),
    reviewer_type: record.reviewer_type === 'expert' ? 'expert' : 'user',
    upvotes: 0,
    downvotes: 0,
    report_count: 0,
    helpfulness_weight: asNumber(record.helpfulness_weight, 0),
    include_in_rating: record.include_in_rating === true,
    criteria_ratings:
      record.criteria_ratings && typeof record.criteria_ratings === 'object'
        ? (record.criteria_ratings as Record<string, number>)
        : criteria,
    verdict:
      verdict === 'authentic' ||
      verdict === 'suspicious' ||
      verdict === 'fake' ||
      verdict === 'unanalyzed'
        ? verdict
        : null,
    fake_probability:
      record.fake_probability == null
        ? null
        : asNumber(record.fake_probability, 0),
    flag_category: FLAG_CATEGORIES.has(flag) ? flag : 'authentic',
    reason: typeof record.reason === 'string' ? record.reason : null,
    signals: {
      source: 'rate_community_jreviews',
      criteria_count: Object.keys(criteria).length,
      comment_length: String(record.comment ?? '').length,
    },
  };
}

/**
 * POST /api/v1/rate/reviews
 * Submits a 5-criteria JReviews evaluation for the signed-in user
 * (Authorization: Bearer <Supabase access token>). The RPC runs as that user;
 * anti-spam classification and the rating weight are applied in the database.
 * Returns an error whenever the review was not stored.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json().catch(() => null);

    const auth = await authenticateRateRequest(request, 'submit a review');
    if (!auth.ok) return auth.response;

    const parsed = SubmitReviewSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error:
            parsed.error.issues[0]?.message || 'Dữ liệu đánh giá không hợp lệ.',
          code: 'INVALID_BODY',
        },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const criteria = sanitizeCriteria(body.criteriaRatings);
    const criteriaValues = Object.values(criteria);
    const computedAvgStar =
      criteriaValues.length > 0
        ? Math.round(
            criteriaValues.reduce((acc, v) => acc + v, 0) /
              criteriaValues.length
          )
        : 5;
    const ratingStar = Math.max(
      1,
      Math.min(5, Math.round(asNumber(body.ratingStar, computedAvgStar)))
    );
    const authorName =
      (body.authorName || '').trim().slice(0, 80) || 'Người dùng Rate.vn';
    const variation = (body.variation || '').trim().slice(0, 120) || null;

    const { data: rpcData, error: rpcError } = await auth.rateClient.rpc(
      'submit_community_review',
      {
        p_master_product_id: body.masterProductId,
        p_author_name: authorName,
        p_rating_star: ratingStar,
        p_comment: body.comment,
        p_variation: variation,
        p_reviewer_type: 'user',
        p_criteria_ratings: criteria,
      }
    );

    if (rpcError) {
      if (isMissingRpcError(rpcError)) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Chức năng gửi đánh giá chưa sẵn sàng trên môi trường này.',
            code: 'REVIEWS_UNAVAILABLE',
          },
          { status: 503 }
        );
      }
      // Errors the RPC raises on purpose carry a user-facing Vietnamese message.
      const rejection = mapRpcRejection(rpcError, RPC_REJECTIONS);
      if (rejection) {
        return NextResponse.json(
          { ok: false, error: rejection.error, code: rejection.code },
          { status: rejection.status }
        );
      }
      log.error('submit_community_review failed', {
        code: rpcError.code,
        message: rpcError.message,
      });
      return NextResponse.json(
        {
          ok: false,
          error: 'Không thể lưu đánh giá lúc này.',
          code: 'PERSIST_FAILED',
        },
        { status: 502 }
      );
    }

    if (!rpcData || typeof rpcData !== 'object' || !('id' in rpcData)) {
      log.error('submit_community_review returned no review id');
      return NextResponse.json(
        {
          ok: false,
          error: 'Không thể lưu đánh giá lúc này.',
          code: 'PERSIST_FAILED',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: 'supabase_rpc',
      review: toReviewItem(rpcData as Record<string, unknown>, criteria),
    });
  } catch (err) {
    log.error('POST failed', { error: serializeError(err) });
    return NextResponse.json(
      { ok: false, error: 'Failed to submit review' },
      { status: 500 }
    );
  }
}
