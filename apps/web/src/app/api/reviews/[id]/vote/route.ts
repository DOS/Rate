import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

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

    const { data: userRes, error: authErr } = await baseClient.auth.getUser(
      bearerToken
    );
    const voterId = userRes?.user?.id;
    if (authErr || !voterId) {
      return NextResponse.json(
        { error: 'Invalid or expired authentication token', code: 'AUTH_INVALID' },
        { status: 401 }
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
          { error: `Failed to clear vote: ${delErr.message}` },
          { status: 400 }
        );
      }
    } else {
      const votePayload =
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
          { error: upsertErr.message, code: upsertErr.code },
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
        { error: selectErr?.message || 'Review not found after vote update' },
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
      { error: 'Failed to vote on review' },
      { status: 500 }
    );
  }
}