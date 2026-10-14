import { NextRequest, NextResponse } from 'next/server';
import {
  getRateClient,
  type ReviewFlagCategory,
  type ReviewItem,
} from '@/lib/rate-api';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SubmitReviewPayload {
  masterProductId?: string;
  authorName?: string;
  ratingStar?: number;
  comment?: string;
  variation?: string;
  reviewerType?: 'user' | 'expert';
  criteriaRatings?: Record<string, number>;
}

function classifySubmittedReview(
  comment: string,
  ratingStar: number,
  criteriaRatings: Record<string, number>
): {
  verdict: 'authentic' | 'suspicious' | 'fake';
  flagCategory: ReviewFlagCategory;
  fakeProbability: number;
  includeInRating: boolean;
  helpfulnessWeight: number;
  reason: string;
} {
  const normalized = comment.trim();
  const len = normalized.length;
  const criteriaCount = Object.keys(criteriaRatings).length;

  if (
    /(nhận xu|kiếm xu|lấy xu|comment lấy xu|hình ảnh chỉ mang tính chất|video chỉ mang tính chất)/i.test(
      normalized
    )
  ) {
    return {
      verdict: 'suspicious',
      flagCategory: 'low_value_coin_spam',
      fakeProbability: 0.85,
      includeInRating: false,
      helpfulnessWeight: 0,
      reason:
        'Phát hiện cụm từ bình luận cày xu mẫu, tự động loại khỏi điểm trung bình JReviews.',
    };
  }

  if (
    /(inbox zalo|liên hệ zalo|nhắn zalo|https?:\/\/|shopee\.ee|s\.shopee)/i.test(
      normalized
    )
  ) {
    return {
      verdict: 'fake',
      flagCategory: 'seeding_fake',
      fakeProbability: 0.92,
      includeInRating: false,
      helpfulnessWeight: 0,
      reason:
        'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng nghi vấn Seeding.',
    };
  }

  if (
    ratingStar <= 2 &&
    /(shop lừa đảo sang shop|mua bên shop khác tốt hơn|đừng mua shop này qua shop)/i.test(
      normalized
    )
  ) {
    return {
      verdict: 'suspicious',
      flagCategory: 'competitor_sabotage',
      fakeProbability: 0.78,
      includeInRating: false,
      helpfulnessWeight: 0,
      reason:
        'Nghi vấn bình luận điều hướng sang đối thủ cạnh tranh thiếu bằng chứng trải nghiệm sản phẩm.',
    };
  }

  if (len < 30) {
    return {
      verdict: 'suspicious',
      flagCategory: 'low_value_coin_spam',
      fakeProbability: 0.65,
      includeInRating: false,
      helpfulnessWeight: 0,
      reason:
        'Nội dung đánh giá quá ngắn (< 30 ký tự), chưa đủ chi tiết kỹ thuật để tính vào điểm chuẩn JReviews.',
    };
  }

  const bonusWeight = criteriaCount >= 4 && len >= 80 ? 1.25 : 1.1;
  return {
    verdict: 'authentic',
    flagCategory: 'authentic',
    fakeProbability: criteriaCount >= 4 ? 0.04 : 0.08,
    includeInRating: true,
    helpfulnessWeight: bonusWeight,
    reason: `Đánh giá thực chất từ cộng đồng Rate.vn (${criteriaCount}/5 tiêu chí kỹ thuật, ${len} ký tự).`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request
      .json()
      .catch(() => ({}))) as SubmitReviewPayload;

    const masterProductId = (body.masterProductId || '').trim();
    if (!masterProductId || !UUID_REGEX.test(masterProductId)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Mã sản phẩm chuẩn hóa (masterProductId) không hợp lệ.',
        },
        { status: 400 }
      );
    }

    const authorName =
      (body.authorName || '').trim().slice(0, 80) || 'Người dùng Rate.vn';
    const comment = (body.comment || '').trim();
    if (comment.length < 15 || comment.length > 3000) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Nội dung đánh giá phải có độ dài từ 15 đến 3.000 ký tự để đảm bảo tính khách quan.',
        },
        { status: 400 }
      );
    }

    const rawCriteria = body.criteriaRatings || {};
    const allowedKeys = [
      'screen',
      'performance',
      'camera',
      'battery',
      'value',
    ] as const;
    const sanitizedCriteria: Record<string, number> = {};
    for (const k of allowedKeys) {
      const val = Number(rawCriteria[k]);
      if (Number.isFinite(val) && val >= 1 && val <= 5) {
        sanitizedCriteria[k] = Math.round(val * 10) / 10;
      }
    }

    const criteriaValues = Object.values(sanitizedCriteria);
    const computedAvgStar =
      criteriaValues.length > 0
        ? Math.round(
            criteriaValues.reduce((acc, v) => acc + v, 0) /
              criteriaValues.length
          )
        : 5;

    const ratingStar = Math.max(
      1,
      Math.min(5, Math.round(Number(body.ratingStar || computedAvgStar)))
    );
    const variation = (body.variation || '').trim().slice(0, 120) || null;
    const reviewerType: 'user' | 'expert' =
      body.reviewerType === 'expert' ? 'expert' : 'user';

    const classification = classifySubmittedReview(
      comment,
      ratingStar,
      sanitizedCriteria
    );

    let persistedMode: 'supabase_rpc' | 'verified_preview' = 'verified_preview';
    let reviewId = crypto.randomUUID();
    let createdAt = new Date().toISOString();

    try {
      const supabase = getRateClient();
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        'submit_community_review',
        {
          p_master_product_id: masterProductId,
          p_author_name: authorName,
          p_rating_star: ratingStar,
          p_comment: comment,
          p_variation: variation,
          p_reviewer_type: reviewerType,
          p_criteria_ratings: sanitizedCriteria,
        }
      );

      if (!rpcErr && rpcData && typeof rpcData === 'object') {
        const record = rpcData as Record<string, unknown>;
        if (typeof record.id === 'string') {
          reviewId = record.id;
          persistedMode = 'supabase_rpc';
        }
        if (typeof record.created_at === 'string') {
          createdAt = record.created_at;
        }
      }
    } catch {
      // Fallback to verified_preview when RPC migration is pending deployment on DOS-Me
    }

    const reviewItem: ReviewItem = {
      id: reviewId,
      author_name: authorName,
      rating_star: ratingStar,
      comment,
      variation,
      created_at: createdAt,
      reviewer_type: reviewerType,
      upvotes: 0,
      downvotes: 0,
      report_count: 0,
      helpfulness_weight: classification.helpfulnessWeight,
      include_in_rating: classification.includeInRating,
      criteria_ratings: sanitizedCriteria,
      verdict: classification.verdict,
      fake_probability: classification.fakeProbability,
      flag_category: classification.flagCategory,
      reason: classification.reason,
      signals: {
        source: 'rate_community_jreviews',
        criteria_count: criteriaValues.length,
        comment_length: comment.length,
      },
    };

    return NextResponse.json({
      ok: true,
      mode: persistedMode,
      review: reviewItem,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to submit review';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
