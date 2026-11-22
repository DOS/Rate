import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  discountVerdictCopy,
  type VerdictTranslator,
} from '../discount-verdict-copy';
import {
  evaluateOmnibusPriceAudit,
  formatOmnibusAuditCopy,
  type OmnibusVerdictTranslator,
} from '../omnibus-price-audit';
import { NBSP } from '../locale-format';
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

  // =========================================================================
  // EU Omnibus 30-Day Price-Floor Audit & Locale Parity (#1863)
  // =========================================================================
  const DAY_MS = 86_400_000;
  const ANCHOR_MS = Date.UTC(2026, 10, 22, 12, 0, 0);
  const isoDaysAgo = (days: number) =>
    new Date(ANCHOR_MS - days * DAY_MS).toISOString();

  const omnibusTranslator = (
    dict: Record<string, string>
  ): OmnibusVerdictTranslator => {
    return (key, values = {}) => {
      const msg = dict[key];
      assert.ok(msg, `missing priceVerdict.${key}`);
      return msg.replace(/\{(\w+)\}/g, (_, name: string) => {
        assert.ok(name in values, `${key} missing {${name}}`);
        return String(values[name]);
      });
    };
  };

  // 1. Key parity & zero em/en-dash check across deals, inspect, priceVerdict
  const fullCatalogs = Object.fromEntries(
    LOCALES.map((loc) => [
      loc,
      JSON.parse(
        readFileSync(
          join(__dirname, '..', '..', '..', 'locales', `${loc}.json`),
          'utf8'
        )
      ) as Record<string, Record<string, string>>,
    ])
  ) as Record<(typeof LOCALES)[number], Record<string, Record<string, string>>>;

  for (const ns of ['deals', 'inspect', 'priceVerdict'] as const) {
    const viKeys = Object.keys(fullCatalogs.vi[ns]!).sort();
    for (const loc of LOCALES) {
      assert.deepEqual(
        Object.keys(fullCatalogs[loc][ns]!).sort(),
        viKeys,
        `${loc}.${ns} key parity`
      );
      for (const [k, v] of Object.entries(fullCatalogs[loc][ns]!)) {
        assert.ok(
          !/[\u2013\u2014]/.test(String(v)),
          `${loc}.${ns}.${k} must not contain en-dash or em-dash`
        );
      }
    }
  }

  // 2. Proposal real flash-sale scenario: 27.49M prior 30d floor -> 27.19M today
  // while seller claims -22.3% from 34.99M.
  const flashSaleAudit = evaluateOmnibusPriceAudit({
    points: [
      { product_id: 'o1', price: 27_490_000, recorded_at: isoDaysAgo(35) },
      { product_id: 'o1', price: 27_990_000, recorded_at: isoDaysAgo(24) },
      { product_id: 'o1', price: 27_490_000, recorded_at: isoDaysAgo(14) },
      { product_id: 'o1', price: 27_690_000, recorded_at: isoDaysAgo(6) },
      { product_id: 'o1', price: 27_190_000, recorded_at: isoDaysAgo(1) },
      { product_id: 'o1', price: 27_190_000, recorded_at: isoDaysAgo(0) },
    ],
    currentPriceVnd: 27_190_000,
    claimedOriginalPriceVnd: 34_990_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(flashSaleAudit.isOmnibusCertified, true);
  assert.equal(flashSaleAudit.windowStatus, 'omnibus_30d_certified');
  assert.equal(flashSaleAudit.priorFloorPriceVnd, 27_490_000);
  assert.equal(flashSaleAudit.deltaVsPriorFloorVnd, -300_000);
  assert.equal(flashSaleAudit.deltaVsPriorFloorPct, -1.1);
  assert.equal(flashSaleAudit.verdict, 'exaggerated_strikethrough');

  for (const loc of LOCALES) {
    const copy = formatOmnibusAuditCopy(
      flashSaleAudit,
      omnibusTranslator(messages[loc]),
      loc
    );
    assert.equal(copy.statusBadgeTone, 'good');
    assert.equal(copy.floorDeltaTone, 'good');
    if (loc === 'cs') {
      assert.ok(copy.floorDeltaText.includes(`-1,1${NBSP}%`));
      assert.ok(copy.floorDeltaText.includes(`300${NBSP}000${NBSP}₫`));
    } else {
      assert.ok(copy.floorDeltaText.includes('-1.1%'));
      assert.ok(copy.floorDeltaText.includes('300.000 ₫'));
    }
  }

  // 3. Hlidac shopu pre-sale bump / fake strikethrough trap:
  // Sold at 24.99M 25 days ago, bumped to 34.99M 10 days ago, now 25.19M.
  const preSaleBumpAudit = evaluateOmnibusPriceAudit({
    points: [
      { product_id: 'o1', price: 24_990_000, recorded_at: isoDaysAgo(32) },
      { product_id: 'o1', price: 24_990_000, recorded_at: isoDaysAgo(22) },
      { product_id: 'o1', price: 34_990_000, recorded_at: isoDaysAgo(10) },
      { product_id: 'o1', price: 25_190_000, recorded_at: isoDaysAgo(0) },
    ],
    currentPriceVnd: 25_190_000,
    claimedOriginalPriceVnd: 34_990_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(preSaleBumpAudit.isOmnibusCertified, true);
  assert.equal(preSaleBumpAudit.priorFloorPriceVnd, 24_990_000);
  assert.equal(preSaleBumpAudit.deltaVsPriorFloorVnd, 200_000);
  assert.equal(preSaleBumpAudit.deltaVsPriorFloorPct, 0.8);
  assert.equal(preSaleBumpAudit.verdict, 'fake_strikethrough_above_floor');
  const bumpEnCopy = formatOmnibusAuditCopy(
    preSaleBumpAudit,
    omnibusTranslator(messages.en),
    'en'
  );
  assert.equal(bumpEnCopy.statusBadgeTone, 'bad');
  assert.equal(bumpEnCopy.floorDeltaTone, 'bad');
  assert.ok(bumpEnCopy.floorDeltaText.includes('+200.000 ₫'));
  assert.ok(bumpEnCopy.floorDeltaText.includes('+0.8%'));

  // 4. Strict < 30d window honesty: 18 days of history never claims 30d Omnibus
  const shortWindowAudit = evaluateOmnibusPriceAudit({
    points: [
      { product_id: 'o1', price: 24_990_000, recorded_at: isoDaysAgo(18) },
      { product_id: 'o1', price: 26_990_000, recorded_at: isoDaysAgo(10) },
      { product_id: 'o1', price: 25_490_000, recorded_at: isoDaysAgo(4) },
      { product_id: 'o1', price: 25_490_000, recorded_at: isoDaysAgo(0) },
    ],
    currentPriceVnd: 25_490_000,
    claimedOriginalPriceVnd: 32_990_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(shortWindowAudit.isOmnibusCertified, false);
  assert.equal(shortWindowAudit.windowStatus, 'partial_window');
  assert.equal(shortWindowAudit.windowDaysUsed, 18);
  assert.equal(shortWindowAudit.verdict, 'unverified_window');
  for (const loc of LOCALES) {
    const shortCopy = formatOmnibusAuditCopy(
      shortWindowAudit,
      omnibusTranslator(messages[loc]),
      loc
    );
    assert.ok(shortCopy.statusBadgeText.includes('18'));
    assert.ok(shortCopy.floorDisclaimerText?.includes('18/30'));
    assert.equal(shortCopy.statusBadgeTone, 'warn');
  }

  // 5. Blackout gap (> 18d inside 30d window) withholds 30d Omnibus certification
  const gappedAudit = evaluateOmnibusPriceAudit({
    points: [
      { product_id: 'o1', price: 24_990_000, recorded_at: isoDaysAgo(35) },
      { product_id: 'o1', price: 26_990_000, recorded_at: isoDaysAgo(2) },
      { product_id: 'o1', price: 25_990_000, recorded_at: isoDaysAgo(0) },
    ],
    currentPriceVnd: 25_990_000,
    claimedOriginalPriceVnd: 29_990_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(gappedAudit.hasBlackoutGap, true);
  assert.equal(gappedAudit.isOmnibusCertified, false);
  assert.equal(gappedAudit.windowStatus, 'blackout_gap');
  assert.equal(gappedAudit.verdict, 'unverified_window');

  // 6. Step-function boundary: an expired 40-day-old flash low superseded at d=31
  // does not leak into the 30-day window.
  const supersededAudit = evaluateOmnibusPriceAudit({
    points: [
      { product_id: 'o1', price: 19_990_000, recorded_at: isoDaysAgo(40) },
      { product_id: 'o1', price: 27_990_000, recorded_at: isoDaysAgo(31) },
      { product_id: 'o1', price: 27_990_000, recorded_at: isoDaysAgo(20) },
      { product_id: 'o1', price: 27_990_000, recorded_at: isoDaysAgo(10) },
      { product_id: 'o1', price: 26_990_000, recorded_at: isoDaysAgo(0) },
    ],
    currentPriceVnd: 26_990_000,
    claimedOriginalPriceVnd: 27_990_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(supersededAudit.isOmnibusCertified, true);
  assert.equal(supersededAudit.priorFloorPriceVnd, 27_990_000);
  assert.equal(supersededAudit.verdict, 'verified_omnibus_reduction');

  // 7. Insufficient (< 1d) history with claimed strikethrough never claims alignment
  const brandNewListingAudit = evaluateOmnibusPriceAudit({
    points: [
      { product_id: 'o1', price: 25_990_000, recorded_at: isoDaysAgo(0) },
    ],
    currentPriceVnd: 25_990_000,
    claimedOriginalPriceVnd: 31_990_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(brandNewListingAudit.windowStatus, 'insufficient_history');
  const brandNewCopy = formatOmnibusAuditCopy(
    brandNewListingAudit,
    omnibusTranslator(messages.en),
    'en'
  );
  assert.equal(brandNewCopy.currentSubTone, 'neutral');
  assert.equal(brandNewCopy.currentSubText, messages.en.oNeed);

  // 8. Round-1 regressions: trailing unobserved silence (`seriesSpanMs < 30d`),
  // blackout_gap windowDaysUsed = 0, and sub-0.05% precision without -0%/+0%.
  const trailingSilenceAudit = evaluateOmnibusPriceAudit({
    points: [
      { product_id: 'o1', price: 24_990_000, recorded_at: isoDaysAgo(32) },
      { product_id: 'o1', price: 25_490_000, recorded_at: isoDaysAgo(22) },
      { product_id: 'o1', price: 25_490_000, recorded_at: isoDaysAgo(12) },
      { product_id: 'o1', price: 25_490_000, recorded_at: isoDaysAgo(8) },
    ],
    currentPriceVnd: 25_490_000,
    claimedOriginalPriceVnd: 29_990_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(trailingSilenceAudit.observedSpanDays, 24);
  assert.equal(trailingSilenceAudit.isOmnibusCertified, false);
  assert.equal(trailingSilenceAudit.windowStatus, 'partial_window');
  assert.equal(trailingSilenceAudit.windowDaysUsed, 24);

  assert.equal(gappedAudit.windowDaysUsed, 0);

  const microStepAudit = evaluateOmnibusPriceAudit({
    points: [
      { product_id: 'o1', price: 25_000_000, recorded_at: isoDaysAgo(32) },
      { product_id: 'o1', price: 25_000_000, recorded_at: isoDaysAgo(20) },
      { product_id: 'o1', price: 25_000_000, recorded_at: isoDaysAgo(10) },
      { product_id: 'o1', price: 24_990_000, recorded_at: isoDaysAgo(0) },
    ],
    currentPriceVnd: 24_990_000,
    claimedOriginalPriceVnd: 25_000_000,
    referenceTimestampMs: ANCHOR_MS,
  });
  assert.equal(microStepAudit.deltaVsPriorFloorPct, -0.04);
  assert.equal(microStepAudit.claimedDiscountPct, 0.04);
  assert.equal(microStepAudit.verdict, 'verified_omnibus_reduction');
  const microStepCopy = formatOmnibusAuditCopy(
    microStepAudit,
    omnibusTranslator(messages.en),
    'en'
  );
  assert.ok(!microStepCopy.floorDeltaText.includes('-0%'));
  assert.ok(microStepCopy.floorDeltaText.includes('-0.04%'));
  assert.equal(microStepCopy.currentSubTone, 'good');

  console.warn('✅ Discount verdict copy suite passed');
}

main();
