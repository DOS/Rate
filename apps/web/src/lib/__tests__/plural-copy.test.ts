import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTranslator } from 'next-intl';
import { analyzerCopy } from '../analyzer-copy';

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

  // The remaining count phrases on the same pages, every Czech form.
  const more: Array<[string, Record<string, number | string>, string]> = [
    [
      'analyzerCopy.summaryDefault',
      { total: 1, kept: 1, removed: 1 },
      'Poslední analýza (jeden obchod) prověřila 1 recenzi: ponechána 1 skutečná recenze a vyřazena 1 spamová, odměnová, falešná nebo bombardující recenze.',
    ],
    [
      'analyzerCopy.summaryDefault',
      { total: 12, kept: 3, removed: 9 },
      'Poslední analýza (jeden obchod) prověřila 12 recenzí: ponechány 3 skutečné recenze a vyřazeno 9 spamových, odměnových, falešných nebo bombardujících recenzí.',
    ],
    [
      'analyzerCopy.summaryNoAuthentic',
      { removed: 1 },
      'Poslední analýza (jeden obchod) po odfiltrování 1 spamového nebo odměnového komentáře nenašla žádné skutečné recenze.',
    ],
    [
      'productDetail.priceHistoryFakeAlertBadge',
      { count: 3 },
      'Odhaleny 3 nabídky s uměle navýšenou původní cenou',
    ],
    [
      'productDetail.priceHistoryFakeAlertBadge',
      { count: 9 },
      'Odhaleno 9 nabídek s uměle navýšenou původní cenou',
    ],
    [
      'productDetail.priceHistoryKpiCurrentMinSub',
      { count: 1 },
      'Agregováno z 1 obchodu',
    ],
    [
      'productDetail.priceReferenceLabel',
      { count: 2 },
      'Referenční tržní rozpětí (2 sledované zdroje):',
    ],
    [
      'productDetail.unknownSizeTitle',
      { count: 5 },
      'Neuvedené úložiště (5 zdrojů)',
    ],
    ['reviews.validCountBadge', { count: 1 }, '✓ 1 platná'],
    ['reviews.expertReviewsCountNote', { count: 2 }, '2 expertní hodnocení'],
    ['reviews.expertReviewsCountNote', { count: 6 }, '6 expertních hodnocení'],
    ['catalog.page.foundSuffix', { total: 3 }, '/ 3 normalizované produkty'],
    [
      'compare.switcherPeerCount',
      { count: 1 },
      '1 standardizovaný model v kategorii',
    ],
    ['compare.valSourcesCount', { count: 4 }, '4 zdroje'],
  ];
  for (const [key, values, expected] of more) {
    assert.equal(
      cs(key as never, values as never),
      expected,
      `cs ${key} ${JSON.stringify(values)}`
    );
  }
  assert.equal(
    en('reviews.expertReviewsCountNote' as never, { count: 1 } as never),
    '1 expert evaluation'
  );
  assert.equal(
    en('compare.valSourcesCount' as never, { count: 1 } as never),
    '1 source'
  );

  // A stored Vietnamese summary, parsed and shown on the Czech page, picks
  // the forms of its own numbers.
  const parsed = analyzerCopy(
    'Lần phân tích gần nhất (một nơi bán) đã xét 2 đánh giá: giữ lại 1 đánh giá thực chất và loại bỏ 1 đánh giá rác, nhận xu, ảo hoặc bom hàng.'
  );
  assert.ok('key' in parsed && parsed.key === 'summaryDefault');
  assert.equal(
    cs(`analyzerCopy.${parsed.key}` as never, parsed.values as never),
    'Poslední analýza (jeden obchod) prověřila 2 recenze: ponechána 1 skutečná recenze a vyřazena 1 spamová, odměnová, falešná nebo bombardující recenze.'
  );

  // A count of a thousand or more is grouped the locale's way.
  assert.equal(
    cs('catalog.page.radarAnalyzedSub' as never, { count: 1234 } as never),
    'Zkontrolováno 1 234 nabídek'
  );
  assert.equal(
    en('catalog.page.radarAnalyzedSub' as never, { count: 1234 } as never),
    'Checked 1,234 store listings'
  );

  // Vietnamese has one form and keeps its plain placeholders.
  const viMessages = read('vi');
  for (const key of [
    'verifiedReviewsCountNoScore',
    'priceHistoryGenuineDealBadge',
  ]) {
    assert.doesNotMatch(viMessages.productDetail[key], /plural/, `vi ${key}`);
  }
  assert.ok(
    vi(
      'productDetail.verifiedReviewsCountNoScore' as never,
      { count: 1 } as never
    ).startsWith('(1 ')
  );

  console.warn('  ✅ Count phrases agree with the number in cs and en (#1370)');
}

main();
