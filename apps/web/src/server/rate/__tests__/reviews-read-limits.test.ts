import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

// DOS/Rate#1961: cursor bounds and the limits of the uncached review reads.
async function main() {
  const { encodeReviewCursor, parseReviewCursor, isReviewCursorInBounds } =
    await import('@/lib/review-cursor');
  const { parseReviewsQueryParams } = await import('@/server/rate/api-handler');
  const {
    checkReviewsReadLimit,
    reviewsRateLimitKey,
    REVIEWS_GET_LIMIT_PER_MINUTE,
    REVIEWS_CURSOR_LIMIT_PER_MINUTE,
    REVIEWS_CURSOR_GLOBAL_LIMIT_PER_MINUTE,
    reviewsCursorGlobalRateLimiter,
  } = await import('@/server/rate/reviews-read-limits');

  const id = '44444444-4444-4444-8444-000000000001';
  const cursorAt = (createdAt: string) =>
    parseReviewCursor(encodeReviewCursor({ created_at: createdAt, id }));

  // Cursor bounds: a plausible review time passes, the far past and future do not.
  const now = Date.parse('2026-11-28T00:00:00Z');
  assert.ok(isReviewCursorInBounds(cursorAt('2026-11-27T10:00:00Z'), now));
  assert.ok(isReviewCursorInBounds(cursorAt('2026-11-28T12:00:00Z'), now));
  assert.ok(!isReviewCursorInBounds(cursorAt('2026-11-30T00:00:00Z'), now));
  assert.ok(!isReviewCursorInBounds(cursorAt('9999-12-31T23:59:59Z'), now));
  assert.ok(!isReviewCursorInBounds(cursorAt('1999-12-31T23:59:59Z'), now));
  assert.ok(!isReviewCursorInBounds(null, now));

  const query = (cursor: string) =>
    new URLSearchParams({
      masterProductId: '99999999-9999-4999-8999-999999990001',
      cursor,
    });
  const goodToken = encodeReviewCursor({
    created_at: '2026-11-01T00:00:00Z',
    id,
  })!;
  const futureToken = encodeReviewCursor({
    created_at: '9999-12-31T23:59:59Z',
    id,
  })!;
  assert.ok(parseReviewsQueryParams(query(goodToken))?.cursor);
  assert.equal(
    parseReviewsQueryParams(query(futureToken)),
    null,
    'an out-of-range cursor is a 400'
  );

  // `anon` callers are told apart instead of sharing one bucket.
  const noIp = (ua: string) => new Headers({ 'user-agent': ua });
  const keyA = reviewsRateLimitKey(noIp('client-a'));
  const keyB = reviewsRateLimitKey(noIp('client-b'));
  assert.match(keyA, /^anon:[0-9a-f]{16}$/);
  assert.notEqual(keyA, keyB);
  assert.equal(keyA, reviewsRateLimitKey(noIp('client-a')));
  assert.equal(
    reviewsRateLimitKey(new Headers({ 'x-forwarded-for': '203.0.113.7' })),
    '203.0.113.7'
  );

  // Cursor reads have a stricter per-client limit than first pages.
  for (let i = 0; i < REVIEWS_CURSOR_LIMIT_PER_MINUTE; i += 1) {
    assert.equal(checkReviewsReadLimit('ip-cursor', true).allowed, true);
  }
  const cursorBlocked = checkReviewsReadLimit('ip-cursor', true);
  assert.equal(cursorBlocked.allowed, false);
  assert.match(
    (cursorBlocked as { message: string }).message,
    /paginated review reads/
  );
  // The same client still gets cached first pages up to the general limit.
  const usedByGeneral = REVIEWS_CURSOR_LIMIT_PER_MINUTE + 1; // the blocked call counted too
  for (let i = usedByGeneral; i < REVIEWS_GET_LIMIT_PER_MINUTE; i += 1) {
    assert.equal(checkReviewsReadLimit('ip-cursor', false).allowed, true);
  }
  assert.equal(checkReviewsReadLimit('ip-cursor', false).allowed, false);

  // Rotating client keys cannot get past the instance-wide cursor ceiling.
  const startUsed = REVIEWS_CURSOR_LIMIT_PER_MINUTE;
  let allowedGlobal = startUsed;
  let blockedBy: string | null = null;
  for (let i = 0; i < REVIEWS_CURSOR_GLOBAL_LIMIT_PER_MINUTE * 2; i += 1) {
    const verdict = checkReviewsReadLimit(`rotating-${i}`, true);
    if (verdict.allowed) {
      allowedGlobal += 1;
    } else {
      blockedBy = verdict.message;
      break;
    }
  }
  assert.equal(allowedGlobal, REVIEWS_CURSOR_GLOBAL_LIMIT_PER_MINUTE);
  assert.match(blockedBy ?? '', /busy/);
  assert.equal(reviewsCursorGlobalRateLimiter.size, 1);
  // First pages are not affected by the cursor ceiling.
  assert.equal(checkReviewsReadLimit('fresh-client', false).allowed, true);

  console.warn('✅ Review read limits & cursor bounds suite passed (#1961)');
}

main();
