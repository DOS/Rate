import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  discountVerdictCopy,
  type VerdictTranslator,
} from '../discount-verdict-copy';
import type { OfferDiscountAnalysis } from '../rate-api';

const LOCALES = ['vi', 'en', 'cs'] as const;

function load(locale: string): Record<string, string> {
  const file = join(__dirname, '..', '..', '..', 'locales', `${locale}.json`);
  return JSON.parse(readFileSync(file, 'utf8')).priceVerdict;
}

// Minimal ICU stand-in: the priceVerdict messages only use simple {name} slots.
function translator(messages: Record<string, string>): VerdictTranslator {
  return (key, values = {}) => {
    const message = messages[key];
    assert.ok(message, `missing priceVerdict.${key}`);
    return message.replace(/\{(\w+)\}/g, (_, name: string) => {
      assert.ok(name in values, `${key} has no value for {${name}}`);
      return String(values[name]);
    });
  };
}

const base: OfferDiscountAnalysis = {
  product_id: 'p1',
  merchant_name: 'Shop',
  platform: 'shopee',
  price_current: 9_000_000,
  price_original: null,
  claimed_discount_pct: 0,
  real_discount_vs_median_pct: 0,
  historical_min_price: 8_500_000,
  historical_max_price: 10_000_000,
  historical_median_price: 9_000_000,
  observation_count: 4,
  verdict: 'normal_price',
  badge_label: 'Giá ổn định',
  explanation: '',
};

const cases: Array<[string, OfferDiscountAnalysis]> = [
  [
    'Cảnh báo giảm giá ảo',
    {
      ...base,
      verdict: 'fake_discount',
      price_original: 15_000_000,
      claimed_discount_pct: 40,
    },
  ],
  [
    'Nghi nâng giá gốc',
    {
      ...base,
      verdict: 'suspicious_discount',
      price_original: 11_000_000,
      claimed_discount_pct: 18.2,
      real_discount_vs_median_pct: -1.5,
    },
  ],
  [
    'Giảm giá thật',
    {
      ...base,
      verdict: 'genuine_deal',
      price_current: 8_000_000,
      price_original: 9_500_000,
      claimed_discount_pct: 15.8,
      real_discount_vs_median_pct: 11.1,
    },
  ],
  [
    'Đáy giá lịch sử',
    {
      ...base,
      verdict: 'genuine_deal',
      price_current: 8_500_000,
      real_discount_vs_median_pct: 5.6,
    },
  ],
  ['Giá ổn định', base],
];

function main() {
  console.warn('🧪 Discount verdict copy suite (#559)');

  const messages = {
    vi: load('vi'),
    en: load('en'),
    cs: load('cs'),
  } satisfies Record<(typeof LOCALES)[number], Record<string, string>>;
  const slots = (m: string | undefined) =>
    [...(m ?? '').matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();

  // Same keys and placeholders in every locale.
  for (const locale of LOCALES) {
    assert.deepEqual(
      Object.keys(messages[locale]).sort(),
      Object.keys(messages.vi).sort(),
      `${locale} keys`
    );
    for (const key of Object.keys(messages.vi)) {
      assert.deepEqual(
        slots(messages[locale][key]),
        slots(messages.vi[key]),
        `${locale}.${key} placeholders`
      );
    }
  }

  const vi = translator(messages.vi);
  const en = translator(messages.en);
  for (const [viLabel, analysis] of cases) {
    // Vietnamese keeps the label rate-api used for this branch.
    const copy = discountVerdictCopy(vi, analysis);
    assert.equal(copy.label, viLabel);
    assert.ok(copy.explanation.includes('₫'), 'explanation shows prices');
    // English carries no Vietnamese text.
    const enCopy = discountVerdictCopy(en, analysis);
    for (const text of [enCopy.label, enCopy.explanation]) {
      assert.ok(
        !/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text),
        text
      );
    }
  }

  // A suspicious verdict never shows a negative "real discount".
  const suspicious = discountVerdictCopy(en, cases[1]![1]);
  assert.ok(suspicious.explanation.includes('(-0%)'), suspicious.explanation);

  // Nullish analysis input falls back safely to normal_price (#854)
  const fallbackNull = discountVerdictCopy(
    en,
    null as unknown as OfferDiscountAnalysis
  );
  assert.equal(fallbackNull.label, messages.en.labelNormal);

  console.warn('✅ Discount verdict copy suite passed');
}

main();
