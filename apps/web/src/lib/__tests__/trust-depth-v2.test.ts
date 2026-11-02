import assert from 'node:assert/strict';
import { evaluateReviewTrustAssessment } from '../rate-domain';

// A form v2 review: its verdict and its writer's pros and cons count with
// the comment for axis C; AI-extracted lines do not (DOS/Rate#1583).
const v2Review = {
  rating_star: 5,
  comment: '',
  reviewer_type: 'user' as const,
  upvotes: 0,
  downvotes: 0,
  report_count: 0,
  flag_category: 'authentic' as const,
  verdict: 'authentic' as const,
  include_in_rating: true,
  signals: null,
};
const v2Text = {
  verdict: 'Máy mượt, đáng tiền trong tầm giá.',
  points: [
    {
      kind: 'pro',
      criterion_key: null,
      body: 'Pin dùng cả ngày',
      method: 'writer',
    },
    {
      kind: 'con',
      criterion_key: 'battery',
      body: 'Sạc hơi chậm',
      method: 'writer',
    },
  ],
};
const v2Bare = evaluateReviewTrustAssessment(v2Review);
const v2Eval = evaluateReviewTrustAssessment(v2Review, v2Text);
assert.equal(v2Bare.depth, 'stars_only');
assert.equal(v2Eval.depth, 'specific_short');
assert.ok(v2Eval.breakdown.weight > v2Bare.breakdown.weight);
assert.equal(
  evaluateReviewTrustAssessment(v2Review, {
    points: v2Text.points.map((p) => ({ ...p, method: 'ai' })),
  }).depth,
  'stars_only'
);
// The writer's lines count on their own: without a verdict, two lines
// that name the product reach specific_short.
assert.equal(
  evaluateReviewTrustAssessment(v2Review, {
    points: [
      { kind: 'pro', body: 'Pin dùng được cả ngày', method: 'writer' },
      { kind: 'con', body: 'Sạc hơi chậm nhưng ổn', method: 'writer' },
    ],
  }).depth,
  'specific_short'
);
// v2 stores the verdict as the comment when there is no free text: said
// twice, it counts once. Doubled, this 53-character verdict would reach
// the 90 of `detailed`.
const longVerdict = 'Máy mượt, pin dùng hết ngày, đáng tiền trong tầm giá.';
const once = evaluateReviewTrustAssessment({
  ...v2Review,
  comment: longVerdict,
});
const twice = evaluateReviewTrustAssessment(
  { ...v2Review, comment: longVerdict },
  { verdict: longVerdict, points: null }
);
assert.equal(once.depth, 'specific_short');
assert.equal(twice.depth, 'specific_short');
assert.equal(twice.breakdown.weight, once.breakdown.weight);

console.log(
  'trust-depth-v2: the verdict and pros and cons of a v2 review count for axis C'
);
