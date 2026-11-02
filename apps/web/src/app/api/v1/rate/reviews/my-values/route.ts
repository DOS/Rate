import { NextResponse } from 'next/server';
import {
  PUBLIC_API_CORS_HEADERS,
  payloadTooLargeResponse,
  readBoundedJsonBody,
} from '@/server/rate/api-handler';
import {
  authenticateRateRequest,
  isMissingRpcError,
} from '@/server/rate/request-auth';
import { createLogger, serializeError } from '@/lib/logger';
import { parseMyReviewValue, parseReviewIds } from '@/lib/review-value-display';

const log = createLogger('api.reviews.my-values');

// The answer belongs to one signed-in writer: never cached, never shared.
const MY_VALUES_HEADERS: Record<string, string> = {
  ...PUBLIC_API_CORS_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MY_VALUES_HEADERS });
}

function fail(status: number, code: string, error: string) {
  return NextResponse.json(
    { ok: false, error, code },
    { status, headers: MY_VALUES_HEADERS }
  );
}

/**
 * POST { ids: uuid[] }: the value score and gaps of the caller's own reviews
 * among `ids` (DOS/Rate#1547, D7). It calls rate.my_review_values with the
 * caller's JWT, so the database answers only for reviews they wrote; other
 * ids are left out of the answer.
 */
export async function POST(request: Request) {
  const auth = await authenticateRateRequest(
    request,
    'read your review values',
    MY_VALUES_HEADERS
  );
  if (!auth.ok) return auth.response;

  const body = await readBoundedJsonBody(request, 8 * 1024);
  if (body.tooLarge) return payloadTooLargeResponse(MY_VALUES_HEADERS);
  const ids = parseReviewIds(
    body.value && typeof body.value === 'object' && !Array.isArray(body.value)
      ? (body.value as { ids?: unknown }).ids
      : undefined
  );
  if (!ids) {
    return fail(400, 'INVALID_IDS', 'Provide ids: up to 100 review uuids');
  }
  if (ids.length === 0) {
    return NextResponse.json(
      { ok: true, values: [] },
      { headers: MY_VALUES_HEADERS }
    );
  }

  const { data, error } = await auth.rateClient.rpc('my_review_values', {
    p_review_ids: ids,
  });
  if (error) {
    if (isMissingRpcError(error)) {
      return fail(
        503,
        'REVIEW_VALUES_UNAVAILABLE',
        'Review values unavailable'
      );
    }
    log.error('my_review_values failed', { error: serializeError(error) });
    return fail(502, 'READ_FAILED', 'Could not read review values');
  }

  const asked = new Set(ids);
  const values = [];
  for (const row of Array.isArray(data) ? data : []) {
    const id =
      typeof row?.review_id === 'string' ? row.review_id.toLowerCase() : '';
    if (!asked.has(id)) continue;
    const value = parseMyReviewValue(row.value_score, row.value_breakdown);
    if (value) values.push({ id, ...value });
  }
  return NextResponse.json(
    { ok: true, values },
    { headers: MY_VALUES_HEADERS }
  );
}
