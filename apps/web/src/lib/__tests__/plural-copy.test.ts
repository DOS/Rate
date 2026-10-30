import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTranslator } from 'next-intl';

// Count phrases on product, category and comparison pages agree with the
// number in Czech (1, 2-4, 5+) and English (1, other) (DOS/Rate#1370).

const read = (locale: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../../../locales/${locale}.json`),
      'utf8'
    )
  );

function main() {
  const cs = createTranslator({ locale: 'cs', messages: read('cs') });
  const en = createTranslator({ locale: 'en', messages: read('en') });
  const vi = createTranslator({ locale: 'vi', messages: read('vi') });

  const csCases: Array<[string, Record<string, number | string>, string]> = [
    [
      'productDetail.priceHistoryGenuineDealBadge',
      { count: 1 },
      '1 nabídka je aktuálně v pásmu skutečné slevy',
    ],
    [
      'productDetail.priceHistoryGenuineDealBadge',
      { count: 3 },
      '3 nabídky jsou aktuálně v pásmu skutečné slevy',
    ],
    [
      'productDetail.priceHistoryGenuineDealBadge',
      { count: 7 },
      '7 nabídek je aktuálně v pásmu skutečné slevy',
    ],
    [
      'productDetail.priceHistoryFakeAlertBadge',
      { count: 1 },
      'Odhalena 1 nabídka s uměle navýšenou původní cenou',
    ],
    [
      'productDetail.verifiedReviewsCount',
      { count: 4 },
      '/ 5.0 (4 ověřené recenze)',
    ],
    [
      'productDetail.verifiedReviewsCountNoScore',
      { count: 1 },
      '(1 ověřená recenze)',
    ],
    [
      'productDetail.verifiedReviewsCountNoScore',
      { count: 15 },
      '(15 ověřených recenzí)',
    ],
    [
      'productDetail.authenticReviewsBadge',
      { count: 2 },
      '2 autentické recenze',
    ],
    ['catalog.page.radarAnalyzedSub', { count: 2 }, 'Zkontrolovány 2 nabídky'],
    [
      'catalog.page.radarAnalyzedSub',
      { count: 42 },
      'Zkontrolováno 42 nabídek',
    ],
    [
      'catalog.meta.laptops.titleCount',
      { count: 2 },
      'Srovnání cen notebooků (2 modely) | Rate.vn',
    ],
    [
      'catalog.meta.smartphones.titleCount',
      { count: 8 },
      'Srovnání cen chytrých telefonů (8 modelů) | Rate.vn',
    ],
    [
      'compare.matrixHeaderSubtitle',
      { count: 2, unit: 'modelů telefonů' },
      'Hodnocení a parametry (2 modely)',
    ],
    [
      'compare.valAuthenticReviews',
      { rating: '5.0', count: 1 },
      '★ 5.0 / 5.0 (1 ověřená recenze)',
    ],
    ['inspect.verifiedReviewsCount', { count: 3 }, '(3 ověřené recenze)'],
    [
      'reviews.basedOnAuthenticReviews',
      { count: 1, weightSum: '1', avgScore: '4.75' },
      'Vypočteno z 1 skutečné recenze (Σw = 1 · Vážený průměr: 4.75).',
    ],
    [
      'analyzerCopy.summaryDefault',
      { total: 4, kept: 4, removed: 0 },
      'Poslední analýza (jeden obchod) prověřila 4 recenze: ponechány 4 skutečné recenze a vyřazeno 0 spamových, odměnových, falešných nebo bombardujících recenzí.',
    ],
  ];
  for (const [key, values, expected] of csCases) {
    assert.equal(
      cs(key as never, values as never),
      expected,
      `cs ${key} ${JSON.stringify(values)}`
    );
  }

  const enCases: Array<[string, Record<string, number | string>, string]> = [
    [
      'productDetail.priceHistoryFakeAlertBadge',
      { count: 1 },
      'Detected 1 listing with inflated original price / fake sale',
    ],
    [
      'productDetail.priceHistoryGenuineDealBadge',
      { count: 1 },
      '1 listing currently in genuine deal zone',
    ],
    [
      'productDetail.priceHistoryGenuineDealBadge',
      { count: 2 },
      '2 listings currently in genuine deal zone',
    ],
    ['catalog.page.radarAnalyzedSub', { count: 1 }, 'Checked 1 store listing'],
    [
      'productDetail.verifiedReviewsCountNoScore',
      { count: 1 },
      '(1 verified review)',
    ],
    [
      'catalog.meta.laptops.titleCount',
      { count: 1 },
      'Laptop price comparison (1 model) | Rate.vn',
    ],
    [
      'compare.matrixHeaderSubtitle',
      { count: 2, unit: 'smartphone models' },
      'Review scores and specs (2 models)',
    ],
  ];
  for (const [key, values, expected] of enCases) {
    assert.equal(
      en(key as never, values as never),
      expected,
      `en ${key} ${JSON.stringify(values)}`
    );
  }

  // Vietnamese has one form; its messages are unchanged.
  assert.equal(
    vi(
      'productDetail.verifiedReviewsCountNoScore' as never,
      { count: 1 } as never
    ),
    `(1 ${read('vi').productDetail.verifiedReviewsCountNoScore.split('{count} ')[1]}`
  );

  console.warn('  ✅ Count phrases agree with the number in cs and en (#1370)');
}

main();
