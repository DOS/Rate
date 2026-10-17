import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sanitizePublicApiError } from '@/server/rate/api-handler';

type VoteAction = 'up' | 'down' | 'report' | 'clear';
type ReportReason = 'spam' | 'fake' | 'offensive' | 'off_topic' | 'other';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_REPORT_REASONS = new Set<ReportReason>([
  'spam',
  'fake',
  'offensive',
  'off_topic',
  'other',
]);

/**
 * Review Trust Model Section 9: Voter Eligibility Gate
 * - Account must be at least 7 days old when `created_at` is present
 * - Account must have a confirmed email or phone when confirmation fields are present
 */
export function evaluateVoterEligibility(user: {
  created_at?: string | null;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
}): { eligible: boolean; reason?: string } {
  if (
    'email_confirmed_at' in user &&
    'phone_confirmed_at' in user &&
    !user.email_confirmed_at &&
    !user.phone_confirmed_at
  ) {
    return {
      eligible: false,
      reason: 'Verified email or phone number is required to vote on reviews.',
    };
  }
  if (typeof user.created_at === 'string' && user.created_at.trim()) {
    const createdMs = Date.parse(user.created_at);
    if (Number.isFinite(createdMs)) {
      const ageDays = (Date.now() - createdMs) / 86_400_000;
      if (ageDays < 7) {
        return {
          eligible: false,
          reason:
            'Account must be at least 7 days old to vote or report reviews.',
        };
      }
    }
  }
  return { eligible: true };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params;

  if (!reviewId || !UUID_REGEX.test(reviewId)) {
    return NextResponse.json(
      { error: 'Invalid review ID format (expected UUID)' },
      { status: 400 }
    );
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!bearerToken) {
    return NextResponse.json(
      {
        error: 'Authentication required to persist review vote',
        code: 'AUTH_REQUIRED',
      },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    let voteType: VoteAction = 'up';
    if (
      body.voteType === 'up' ||
      body.voteType === 'down' ||
      body.voteType === 'report' ||
      body.voteType === 'clear'
    ) {
      voteType = body.voteType;
    } else if (typeof body.helpful === 'boolean') {
      voteType = body.helpful ? 'up' : 'down';
    }

    const rawReason =
      typeof body.reportReason === 'string'
        ? body.reportReason
        : typeof body.reason === 'string'
          ? body.reason
          : null;
    const reportReason: ReportReason =
      rawReason && VALID_REPORT_REASONS.has(rawReason as ReportReason)
        ? (rawReason as ReportReason)
        : 'spam';

    const baseClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    });
    const rateClient = baseClient.schema('rate');

    const { data: userRes, error: authErr } =
      await baseClient.auth.getUser(bearerToken);
    const voterId = userRes?.user?.id;
    if (authErr || !voterId || !userRes?.user) {
      return NextResponse.json(
        {
          error: 'Invalid or expired authentication token',
          code: 'AUTH_INVALID',
        },
        { status: 401 }
      );
    }

    const eligibility = evaluateVoterEligibility(userRes.user);
    if (!eligibility.eligible) {
      return NextResponse.json(
        {
          error: eligibility.reason || 'Voter account is not eligible to vote',
          code: 'VOTER_NOT_ELIGIBLE',
        },
        { status: 403 }
      );
    }

    if (voteType === 'clear') {
      const { error: delErr } = await rateClient
        .from('review_votes')
        .delete()
        .eq('review_id', reviewId)
        .eq('voter_id', voterId);

      if (delErr) {
        return NextResponse.json(
          {
            error: sanitizePublicApiError(
              delErr,
              'Failed to clear review vote'
            ),
          },
          { status: 400 }
        );
      }
    } else {
      const votePayload: {
        review_id: string;
        voter_id: string;
        vote: 'up' | 'down' | null;
        reported: boolean;
        report_reason: ReportReason | null;
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
        const isRateLimit = upsertErr.code === '54000';
        return NextResponse.json(
          {
            error: isRateLimit
              ? 'Rate limit exceeded (maximum 60 vote actions per hour)'
              : sanitizePublicApiError(
                  upsertErr,
                  'Failed to record review vote'
                ),
            code: isRateLimit ? 'RATE_LIMIT_EXCEEDED' : 'VOTE_REJECTED',
          },
          { status: isRateLimit ? 429 : 400 }
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
        { error: 'Review not found after vote update' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: 'authenticated',
      reviewId,
      voteType,
      upvotes: Number(updatedReview.upvotes ?? 0),
      downvotes: Number(updatedReview.downvotes ?? 0),
      reports: Number(updatedReview.report_count ?? 0),
      helpfulnessWeight: Number(updatedReview.helpfulness_weight ?? 1),
    });
  } catch (error) {
    console.error('Error voting on review:', error);
    return NextResponse.json(
      { error: sanitizePublicApiError(error, 'Failed to vote on review') },
      { status: 500 }
    );
  }
}
