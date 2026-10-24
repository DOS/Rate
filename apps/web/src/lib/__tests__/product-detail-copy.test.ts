import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeProductRadarSignal } from '../../server/rate/deals';
import { bayesianTierKey, radarExplanation } from '../product-detail-copy';
import { localizeSpecValue } from '../spec-localizer';
import { computeBayesianRatingSummary } from '../rate-api';

type Messages = Record<string, Record<string, string>>;

const readLocale = (locale: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../locales/${locale}.json`, import.meta.url),
      'utf8'
    )
  ) as Messages;

// Drops the <value> rich-text tags that mark marketplace text (DOS/Rate#720).
const fill = (template: string, values: Record<string, string>) =>
  template
    .replace(/<\/?value>/g, '')
    .replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '');

function main() {
  console.warn('🧪 Product detail copy suite');
  const vi = readLocale('vi').productDetail!;

  // Every tier, including both "few samples" labels, rebuilds the Vietnamese
  // label the server returns.
  const review = (weight: number) => ({
    rating_star: 5,
    helpfulness_weight: weight,
    include_in_rating: true,
  });
  const tierCases = [
    [],
    [review(1)],
    [review(2)],
    [review(2), review(3)],
    Array.from({ length: 6 }, () => review(2.5)),
  ];
  const seen = new Set<string>();
  for (const reviews of tierCases) {
    const summary = computeBayesianRatingSummary(reviews, 4);
    const key = bayesianTierKey(summary);
    seen.add(key);
    assert.equal(vi[key], summary.tierLabelVi, key);
  }
  assert.equal(seen.size, 5, 'every tier is covered');

  // One genuine deal and one inflated strikethrough on the same product.
  const master = {
    id: 'id-1',
    slug: 'phone-1',
    name: 'Phone 1',
    brand: 'Brand',
    category: 'smartphones',
    min_price: 9_000_000,
    max_price: 11_000_000,
  };
  const offer = (i: number, price: number, original: number | null) => ({
    id: 'o-' + i,
    platform: ['shopee', 'lazada', 'tiki'][i],
    url: 'https://example.test/' + i,
    price_current: price,
    price_original: original,
    merchant: {
      id: 'm-' + i,
      name: 'Shop ' + i,
      risk_score: 5,
      is_official: true,
    },
  });
  const signal = computeProductRadarSignal(
    master as never,
    [
      offer(0, 9_000_000, null),
      offer(1, 10_000_000, null),
      offer(2, 11_000_000, 20_000_000),
    ] as never
  );
  assert.equal(signal.verdict, 'genuine_deal');
  const genuine = radarExplanation(signal);
  assert.equal(genuine?.key, 'radarExplanationGenuineDeal');
  assert.equal(
    fill(vi[genuine!.key]!, genuine!.values),
    signal.genuineDeal?.explanationVi
  );

  assert.ok(signal.fakeSaleTrap);
  const trapSignal = { ...signal, verdict: 'fake_sale_trap' as const };
  const trap = radarExplanation(trapSignal);
  assert.equal(trap?.key, 'radarExplanationFakeSale');
  assert.equal(
    fill(vi[trap!.key]!, trap!.values),
    signal.fakeSaleTrap?.explanationVi
  );

  assert.equal(
    radarExplanation({ ...signal, verdict: 'none' }),
    null,
    'no note without a verdict'
  );
  assert.equal(
    radarExplanation({ ...signal, genuineDeal: null }),
    null,
    'no note without the deal it explains'
  );

  // The keys exist in every locale with the same placeholders.
  const keys = [
    'bayesianTierHigh',
    'bayesianTierMedium',
    'bayesianTierLow',
    'bayesianTierSmoothed',
    'bayesianTierPrior',
    'radarExplanationGenuineDeal',
    'radarExplanationFakeSale',
  ];
  const placeholders = (s: string) =>
    [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const locale of ['en', 'cs']) {
    const messages = readLocale(locale).productDetail!;
    for (const key of keys) {
      assert.ok(messages[key], `${locale}.productDetail.${key} is missing`);
      assert.deepEqual(
        placeholders(messages[key]!),
        placeholders(vi[key]!),
        `${locale}.productDetail.${key} placeholders`
      );
    }
  }

  // Non-finite / negative radar values & control-char sanitization (#854)
  assert.equal(
    bayesianTierKey({
      confidenceTier: 'none' as never,
      effectiveWeightSum: Number.NaN,
    }),
    'bayesianTierPrior'
  );
  const sanitizedDealExp = radarExplanation({
    verdict: 'genuine_deal',
    genuineDeal: {
      ...signal.genuineDeal!,
      savingsVsMedianVnd: -500_000,
      savingsVsMedianPct: Number.NaN,
      merchantName: '  Official\u0000 Store  ',
      platform: ' shopee\u0007 ',
    },
    fakeSaleTrap: null,
  });
  assert.equal(sanitizedDealExp?.key, 'radarExplanationGenuineDeal');
  if (sanitizedDealExp?.key === 'radarExplanationGenuineDeal') {
    assert.equal(sanitizedDealExp.values.savings, '0');
    assert.equal(sanitizedDealExp.values.pct, '0');
    assert.equal(sanitizedDealExp.values.merchant, 'Official Store');
    assert.equal(sanitizedDealExp.values.platform, 'SHOPEE');
  }

  // spec-localizer control-char stripping & length cap (#854)
  assert.equal(localizeSpecValue('\u0000\u0007', 'vi'), '-');
  assert.equal(localizeSpecValue('Quad\u0000Camera', 'vi'), 'Cụm 4 camera');
  assert.equal(localizeSpecValue('x'.repeat(3_000), 'en').length, 2_000);

  console.warn('✅ Product detail copy suite passed');
}

main();
