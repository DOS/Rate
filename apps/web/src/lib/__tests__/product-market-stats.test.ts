import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isOfferUnavailable,
  productMarketStats,
  toOfferAvailability,
} from '../product-market-stats';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

async function main() {
  console.warn('🧪 Product market stats suite (DOS/Rate#1141)');

  // The live Galaxy Buds3 Pro case: both FPT Shop listings are sold out, so
  // the stored stats count TGDD and CellphoneS only. The product page used to
  // show 2,694,000 from 3 sellers; every other page showed 3,140,000 from 2.
  const buds = {
    min_price: 3140000,
    max_price: 3690000,
    merchant_count: 2,
  };
  assert.deepEqual(productMarketStats(buds), {
    minPrice: 3140000,
    maxPrice: 3690000,
    sellerCount: 2,
  });
  // PostgREST returns numeric columns as strings.
  assert.deepEqual(
    productMarketStats({
      min_price: '16490000',
      max_price: '16490000',
      merchant_count: 1,
    }),
    { minPrice: 16490000, maxPrice: 16490000, sellerCount: 1 }
  );
  // No in-stock listing: no price and no sellers, never "from 0 at 3 stores".
  assert.deepEqual(
    productMarketStats({ min_price: null, max_price: null, merchant_count: 3 }),
    { minPrice: 0, maxPrice: 0, sellerCount: 0 }
  );
  assert.deepEqual(productMarketStats(null), {
    minPrice: 0,
    maxPrice: 0,
    sellerCount: 0,
  });
  assert.equal(
    productMarketStats({ min_price: 500, max_price: 500, merchant_count: null })
      .sellerCount,
    1,
    'A stored price has at least one seller'
  );
  // A max below the min (a partial write) never shows a reversed range.
  assert.equal(
    productMarketStats({ min_price: 500, max_price: 100, merchant_count: 1 })
      .maxPrice,
    500
  );
  assert.equal(
    productMarketStats({ min_price: 2e9, max_price: 2e9, merchant_count: 1 })
      .minPrice,
    0,
    'A price above the VND ceiling is not a price'
  );

  assert.equal(isOfferUnavailable({ availability: 'out_of_stock' }), true);
  assert.equal(isOfferUnavailable({ availability: 'discontinued' }), true);
  assert.equal(isOfferUnavailable({ availability: 'in_stock' }), false);
  assert.equal(
    isOfferUnavailable({ availability: null }),
    false,
    'An unread availability counts as in stock, as the column default does'
  );
  assert.equal(isOfferUnavailable({}), false);
  assert.equal(toOfferAvailability('out_of_stock'), 'out_of_stock');
  assert.equal(toOfferAvailability('OUT_OF_STOCK'), null);
  assert.equal(toOfferAvailability(undefined), null);

  // The offer list labels sold-out listings and leaves them out of the price
  // spread, so its cheapest offer matches the stored "from" price.
  const { computeOffersPriceSpreadAudit } =
    await import('../../components/leaderboard/ProductOffersExplorer');
  const offer = (
    id: string,
    platform: string,
    price: number,
    availability: 'in_stock' | 'out_of_stock' | null
  ) =>
    ({
      id,
      platform,
      title: id,
      price_current: price,
      price_original: null,
      stock: 0,
      rating_star: 0,
      rating_count: 0,
      url: '',
      availability,
      merchant: {
        id: `m-${platform}`,
        name: platform,
        platform,
        is_official: true,
        rating_star: null,
        follower_count: 0,
        location: null,
        risk_score: 0,
        dosafe_risk_score: null,
        review_risk_score: null,
        review_risk_breakdown: null,
      },
    }) as const;
  const budsOffers = [
    offer('fpt-1', 'fptshop', 2694000, 'out_of_stock'),
    offer('fpt-2', 'fptshop', 3032000, 'out_of_stock'),
    offer('tgdd', 'tgdd', 3140000, 'in_stock'),
    offer('cps', 'cellphones', 3690000, null),
  ];
  const spread = computeOffersPriceSpreadAudit(budsOffers);
  assert.ok(spread);
  assert.equal(spread.cheapest.price_current, buds.min_price);
  // Here only: the stored max also counts a listing's variant top price.
  assert.equal(spread.priciest.price_current, buds.max_price);

  // Every surface reads the stored stats. The product page, its metadata and
  // its JSON-LD go through productMarketStats and never recompute the "from"
  // price or the seller count from the offer list.
  const page = read('../../app/[locale]/smartphones/[slug]/page.tsx');
  assert.match(
    page,
    /productMarketStats,\n\} from '@\/lib\/product-market-stats'/
  );
  assert.doesNotMatch(
    page,
    /plausibleMinPrice\(/,
    'The product page must not derive its "from" price from the offers'
  );
  assert.doesNotMatch(
    page,
    /product\.(merchant_count|max_price)\b/,
    'Seller count and range come from productMarketStats only'
  );
  assert.doesNotMatch(
    page,
    /new Set\(\s*offers/,
    'The seller count is not counted from the offer list'
  );
  const metadata = page.slice(
    page.indexOf('export async function generateCategoryProductMetadata'),
    page.indexOf('export async function generateMetadata')
  );
  assert.match(metadata, /productMarketStats\(product\)/);
  assert.match(metadata, /merchantCount: marketStats\.sellerCount/);
  assert.doesNotMatch(metadata, /getCachedMasterProductOffers/);
  assert.match(page, /lowPrice: currentMinPrice/);
  assert.match(page, /offerCount: sellerCount/);

  assert.match(
    page,
    /computeProductRadarSignal\(product, inStockOffers\)/,
    'The radar note never quotes a sold-out listing'
  );
  assert.match(page, /currentMinPrice: currentMinPrice > 0 \? currentMinPrice/);

  const productApi = read('../../app/api/v1/rate/products/[slug]/route.ts');
  assert.match(
    productApi,
    /offers\.filter\(\(o\) => !isOfferUnavailable\(o\)\)/
  );
  const watchlist = read('../../app/api/v1/rate/watchlist/route.ts');
  assert.doesNotMatch(
    watchlist,
    /withPlausibleMinPrice/,
    'Watchlist prices and alerts use the stored min_price'
  );

  // The catalogue, compare and the API read the same stored columns.
  const api = read('../rate-api.ts');
  assert.match(
    api,
    /'id, slug, name, model, brand, category_id, metadata, specifications, min_price, max_price, merchant_count'/,
    'compareMasterProducts reads the stored stats'
  );

  console.warn('✅ Product market stats suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
