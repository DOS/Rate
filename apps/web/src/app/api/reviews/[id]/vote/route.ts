import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { RATE_CACHE_TAGS } from '@/server/rate';
import {
  resolveReviewVoteInput,
  sanitizePublicApiError,
  type ReviewReportReason,
} from '@/server/rate/api-handler';
import { authenticateRateRequest } from '@/server/rate/request-auth';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api.reviews.vote');

const REVIEW_VOTE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Rate-Extension-Version',
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: REVIEW_VOTE_CORS_HEADERS,
  });
}

const NOT_ELIGIBLE_AGE_REASON =
  'Account must be at least 7 days old to vote or report reviews.';

function isValidConfirmedTimestamp(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.replace(/\p{Cc}+/gu, '').trim();
  if (!trimmed || trimmed.length > 64) return false;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) && ms > 0;
}

/**
 * Review Trust Model Section 9: Voter Eligibility Gate. The database applies
 * the same rules in rate.review_votes_guard (DOS/Rate#613, #771):
 * - Rejects anonymous Supabase sessions (`is_anonymous === true`)
 * - Account must have a confirmed email or phone. The auth server omits these
 *   fields when they are null, so a missing field counts as unconfirmed.
 * - Account must be at least 7 days old; a missing or unparseable
 *   `created_at` fails closed.
 */
export function evaluateVoterEligibility(
  user:
    | {
        created_at?: string | null;
        email_confirmed_at?: string | null;
        phone_confirmed_at?: string | null;
        is_anonymous?: boolean | null;
      }
    | null
    | undefined
): { eligible: boolean; reason?: string } {
  if (!user || typeof user !== 'object') {
    return { eligible: false, reason: NOT_ELIGIBLE_AGE_REASON };
  }
  if (user.is_anonymous === true) {
    return {
      eligible: false,
      reason: 'Anonymous accounts cannot vote on reviews.',
    };
  }
  if (
    !isValidConfirmedTimestamp(user.email_confirmed_at) &&
    !isValidConfirmedTimestamp(user.phone_confirmed_at)
  ) {
    return {
      eligible: false,
      reason: 'Verified email or phone number is required to vote on reviews.',
    };
  }
  const cleanedCreatedAt =
    typeof user.created_at === 'string'
      ? user.created_at.replace(/\p{Cc}+/gu, '').trim()
      : '';
  const createdMs =
    cleanedCreatedAt && cleanedCreatedAt.length <= 64
      ? Date.parse(cleanedCreatedAt)
      : NaN;
  if (!Number.isFinite(createdMs) || createdMs <= 0) {
    return { eligible: false, reason: NOT_ELIGIBLE_AGE_REASON };
  }
  const ageDays = (Date.now() - createdMs) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 7) {
    return { eligible: false, reason: NOT_ELIGIBLE_AGE_REASON };
  }
  return { eligible: true };
}

function toSafeVoteCount(value: unknown): number {
  if (typeof value === 'boolean' || value === null || value === undefined) {
    return 0;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(100_000_000, Math.floor(n)) : 0;
}

function toSafeHelpfulnessWeight(value: unknown, fallback = 1): number {
  if (
    typeof value === 'boolean' ||
    value === null ||
    value === undefined ||
    (typeof value === 'string' && !value.trim())
  ) {
    return fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : fallback;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawReviewId } = await params;
  const reviewId =
    typeof rawReviewId === 'string'
      ? rawReviewId.replace(/\p{Cc}+/gu, '').trim()
      : '';

  if (!reviewId || !UUID_REGEX.test(reviewId)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid review ID format (expected UUID)' },
      { status: 400, headers: REVIEW_VOTE_CORS_HEADERS }
    );
  }

  try {
    const rawBody = await request.json().catch(() => null);

    const auth = await authenticateRateRequest(
      request,
      'vote on a review',
      REVIEW_VOTE_CORS_HEADERS
    );
    if (!auth.ok) {
      return auth.response;
    }

    const parsedInput = resolveReviewVoteInput(rawBody);
    if (!parsedInput) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Invalid vote action; provide voteType in ["up", "down", "report", "clear"] or boolean helpful',
          code: 'INVALID_VOTE_ACTION',
        },
        { status: 400, headers: REVIEW_VOTE_CORS_HEADERS }
      );
    }
    const { voteType, reportReason } = parsedInput;
    const { userId: voterId, user, rateClient } = auth;

    // Clearing one's own vote stays open to every signed-in voter, as in the
    // database guard (DOS/Rate#771): an account that voted before the rules
    // applied can still withdraw it.
    const eligibility =
      voteType === 'clear'
        ? { eligible: true as const }
        : evaluateVoterEligibility(user);
    if (!eligibility.eligible) {
      return NextResponse.json(
        {
          ok: false,
          error: eligibility.reason || 'Voter account is not eligible to vote',
          code: 'VOTER_NOT_ELIGIBLE',
        },
        { status: 403, headers: REVIEW_VOTE_CORS_HEADERS }
      );
    }

    // A clear that removed nothing changes no count, so it must not flush the
    // shared caches: clearing is open to every signed-in session and has no
    // rate limit (DOS/Rate#771).
    let votesChanged = true;
    if (voteType === 'clear') {
      const { error: delErr, count: deletedCount } = await rateClient
        .from('review_votes')
        .delete({ count: 'exact' })
        .eq('review_id', reviewId)
        .eq('voter_id', voterId);
      votesChanged = deletedCount !== 0;

      if (delErr) {
        return NextResponse.json(
          {
            ok: false,
            error: sanitizePublicApiError(
              delErr,
              'Failed to clear review vote'
            ),
          },
          { status: 400, headers: REVIEW_VOTE_CORS_HEADERS }
        );
      }
    } else {
      const votePayload: {
        review_id: string;
        voter_id: string;
        vote: 'up' | 'down' | null;
        reported: boolean;
        report_reason: ReviewReportReason | null;
      } =
        voteType === 'report'
          ? {
              review_id: reviewId,
              voter_id: voterId,
              vote: null,
              reported: true,
              report_reason: reportReason,
            }
          : {
              review_id: reviewId,
              voter_id: voterId,
              vote: voteType,
              reported: false,
              report_reason: null,
            };

      const { error: upsertErr } = await rateClient
        .from('review_votes')
        .upsert(votePayload, { onConflict: 'review_id,voter_id' });

      if (upsertErr) {
        // The database guard rejects ineligible voters with 42501 and this
        // message (DOS/Rate#613). Other 42501s (a missing grant) are not the
        // voter's fault: they fall through to the logged generic answer.
        if (
          upsertErr.code === '42501' &&
          upsertErr.message?.startsWith('review_votes: account is not eligible')
        ) {
          return NextResponse.json(
            {
              ok: false,
              error: 'Voter account is not eligible to vote on reviews.',
              code: 'VOTER_NOT_ELIGIBLE',
            },
            { status: 403, headers: REVIEW_VOTE_CORS_HEADERS }
          );
        }
        const isRateLimit = upsertErr.code === '54000';
        if (!isRateLimit) {
          log.warn('vote upsert rejected', {
            code: upsertErr.code,
            message: upsertErr.message,
          });
        }
        return NextResponse.json(
          {
            ok: false,
            error: isRateLimit
              ? 'Rate limit exceeded (maximum 60 vote actions per hour)'
              : sanitizePublicApiError(
                  upsertErr,
                  'Failed to record review vote'
                ),
            code: isRateLimit ? 'RATE_LIMIT_EXCEEDED' : 'VOTE_REJECTED',
          },
          {
            status: isRateLimit ? 429 : 400,
            headers: REVIEW_VOTE_CORS_HEADERS,
          }
        );
      }
    }

    const { data: updatedReview, error: selectErr } = await rateClient
      .from('reviews')
      .select('id, upvotes, downvotes, report_count, helpfulness_weight')
      .eq('id', reviewId)
      .maybeSingle();

    if (selectErr || !updatedReview) {
      return NextResponse.json(
        { ok: false, error: 'Review not found after vote update' },
        { status: 404, headers: REVIEW_VOTE_CORS_HEADERS }
      );
    }

    for (const tag of votesChanged
      ? [
          RATE_CACHE_TAGS.REVIEWS,
          RATE_CACHE_TAGS.PRODUCTS,
          RATE_CACHE_TAGS.STATS,
        ]
      : []) {
      try {
        revalidateTag(tag, 'max');
      } catch {
        // Ignore outside Next.js static generation runtime
      }
    }

    return NextResponse.json(
      {
        ok: true,
        mode: 'authenticated',
        reviewId,
        voteType,
        upvotes: toSafeVoteCount(updatedReview.upvotes),
        downvotes: toSafeVoteCount(updatedReview.downvotes),
        reports: toSafeVoteCount(updatedReview.report_count),
        helpfulnessWeight: toSafeHelpfulnessWeight(
          updatedReview.helpfulness_weight,
          1
        ),
      },
      {
        status: 200,
        headers: REVIEW_VOTE_CORS_HEADERS,
      }
    );
  } catch (error) {
    log.error('vote failed', { error: serializeError(error) });
    return NextResponse.json(
      {
        ok: false,
        error: sanitizePublicApiError(error, 'Failed to vote on review'),
      },
      { status: 500, headers: REVIEW_VOTE_CORS_HEADERS }
    );
  }
}
