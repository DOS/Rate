import assert from 'node:assert/strict';
import {
  emptyReviewV2Draft,
  isReviewFormV2Enabled,
  parseReviewV2Draft,
  reviewV2Errors,
  reviewV2InputFromDraft,
  reviewV2Star,
  type ReviewV2Input,
} from '../review-form-v2';

const fields = (input: ReviewV2Input, category = 'smartphones') =>
  reviewV2Errors(category, input).map((e) => `${e.field}:${e.key}`);

const VALID: ReviewV2Input = {
  criteriaRatings: {
    performance: 4.5,
    camera: 4,
    battery: 5,
    display: 4,
    design: 4,
    value: 3.5,
  },
  verdict: 'Hợp người chụp ảnh nhiều, không hợp người chơi game nặng.',
  pros: ['Pin dùng trọn ngày', 'Camera chụp đêm tốt'],
  cons: ['Giá hơi cao so với cấu hình'],
};

function main() {
  console.warn('🧪 Review form v2 suite');

  // The flag is off unless the env says "1".
  delete process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2;
  assert.equal(isReviewFormV2Enabled(), false);
  process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2 = 'true';
  assert.equal(isReviewFormV2Enabled(), false);
  process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2 = '1';
  assert.equal(isReviewFormV2Enabled(), true);
  delete process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2;

  assert.deepEqual(fields(VALID), []);

  // No verdict, no pro, no con: each is its own field error.
  assert.deepEqual(fields({ ...VALID, verdict: '', pros: [], cons: [] }), [
    'verdict:v2ErrVerdict',
    'pros:v2ErrCount',
    'cons:v2ErrCount',
  ]);

  // "Đáng tiền" is required; two skipped criteria are fine, three are not.
  const { value: _value, ...noValue } = VALID.criteriaRatings;
  void _value;
  assert.deepEqual(fields({ ...VALID, criteriaRatings: noValue }), [
    'criterion.value:v2ErrRequired',
  ]);
  assert.deepEqual(
    fields({
      ...VALID,
      criteriaRatings: { performance: 4, camera: 4, battery: 4, value: 4 },
    }),
    []
  );
  assert.deepEqual(
    fields({
      ...VALID,
      criteriaRatings: { performance: 4, camera: 4, value: 4 },
    }),
    ['criteria:v2ErrSkipped']
  );
  // Half stars only, and only the category's own criteria.
  assert.deepEqual(
    fields({
      ...VALID,
      criteriaRatings: { ...VALID.criteriaRatings, camera: 4.3, screen: 5 },
    }),
    ['criterion.camera:v2ErrCriterion', 'criterion.screen:v2ErrCriterion']
  );

  // Line rules name the line.
  assert.deepEqual(
    fields({
      ...VALID,
      pros: ['Pin dùng trọn ngày', 'pin dùng trọn ngày!', 'abc'],
      cons: ['không có', 'Pin dùng trọn ngày'],
    }),
    [
      'pros.1:v2ErrDuplicate',
      'pros.2:v2ErrLength',
      'cons.0:v2ErrEvasive',
      'cons.1:v2ErrBoth',
    ]
  );

  // Pros and cons of a criterion: only a rated one, at most 3, real lines.
  assert.deepEqual(
    fields({
      ...VALID,
      criterionPoints: {
        battery: {
          pros: ['Sạc 30 phút được 70%'],
          cons: ['Sạc không dây chậm'],
        },
      },
    }),
    []
  );
  assert.deepEqual(
    fields({
      ...VALID,
      criteriaRatings: { ...VALID.criteriaRatings, design: null },
      criterionPoints: {
        design: { pros: ['Khung nhôm chắc chắn'] },
        sound: { pros: ['Loa to rõ'] },
        battery: {
          pros: ['Pin trâu một', 'Pin trâu hai', 'Pin trâu ba', 'Pin trâu bốn'],
          cons: ['chưa thấy', 'Hơi nóng khi sạc', 'hơi nóng khi sạc'],
        },
      },
    }),
    [
      'points.design:v2ErrCriterion',
      'points.sound:v2ErrCriterion',
      'points.battery.pros:v2ErrCount',
      'points.battery.cons.0:v2ErrEvasive',
      'points.battery.cons.2:v2ErrDuplicate',
    ]
  );

  // A line both a pro and a con of one criterion, and an empty entry.
  assert.deepEqual(
    fields({
      ...VALID,
      criterionPoints: {
        battery: { pros: ['Pin dùng hơi nóng'], cons: ['pin dùng hơi nóng'] },
        camera: { pros: [], cons: [] },
      },
    }),
    ['points.battery.cons.0:v2ErrBoth', 'points.camera:v2ErrCount']
  );

  // A malformed body gives errors and never throws.
  assert.ok(
    reviewV2Errors('smartphones', null as unknown as ReviewV2Input).length > 0
  );
  assert.ok(
    reviewV2Errors('smartphones', {
      criteriaRatings: 'x',
      verdict: 5,
      pros: 'a',
      cons: null,
      criterionPoints: { value: 'x' },
    } as unknown as ReviewV2Input).length > 0
  );

  // The stored star is the weighted average at 0.1, never the browser's.
  // 4.5*20 + 4*20 + 5*20 + 4*15 + 4*10 + 3.5*15 = 422.5 / 100 = 4.225
  assert.equal(reviewV2Star('smartphones', VALID.criteriaRatings), 4.2);
  // Skipped criteria leave the weights: (5*20 + 3*15) / 35 = 4.14
  assert.equal(reviewV2Star('smartphones', { battery: 5, value: 3 }), 4.1);
  assert.equal(reviewV2Star('smartphones', {}), null);
  // Earbuds rate their own list: sound weighs 30. (5*30 + 3*15) / 45 = 4.33
  assert.equal(reviewV2Star('earbuds', { sound: 5, value: 3 }), 4.3);

  // The draft drops blank lines and points of an unrated criterion.
  const draft = {
    ...emptyReviewV2Draft(),
    ratings: { battery: 5, design: null, value: 4 },
    verdict: '  Hợp người dùng nhiều pin, đi công tác dài ngày.  ',
    pros: ['Pin trâu', '  ', ''],
    cons: [' Nặng tay '],
    points: {
      battery: { pros: ['Sạc nhanh'], cons: [''] },
      design: { pros: ['Đẹp'], cons: [] },
      value: { pros: [' '], cons: [] },
    },
  };
  assert.deepEqual(reviewV2InputFromDraft(draft), {
    criteriaRatings: { battery: 5, value: 4 },
    verdict: 'Hợp người dùng nhiều pin, đi công tác dài ngày.',
    pros: ['Pin trâu'],
    cons: ['Nặng tay'],
    criterionPoints: { battery: { pros: ['Sạc nhanh'], cons: [] } },
  });

  // A stored draft round-trips; a broken one is ignored.
  assert.deepEqual(parseReviewV2Draft(JSON.stringify(draft))?.ratings, {
    battery: 5,
    design: null,
    value: 4,
  });
  assert.equal(parseReviewV2Draft('{oops'), null);
  assert.equal(parseReviewV2Draft('null'), null);
  assert.equal(parseReviewV2Draft(null), null);
  assert.deepEqual(parseReviewV2Draft('{"pros":[1,"a"]}')?.pros, ['a']);
  // A stored star off the half steps is dropped, so the picker keeps a stop.
  assert.deepEqual(
    parseReviewV2Draft('{"ratings":{"camera":3.3,"battery":7,"value":4.5}}')
      ?.ratings,
    { value: 4.5 }
  );

  console.warn('✅ Review form v2 suite passed');
}

main();
