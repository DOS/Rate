import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SALE_STATES,
  masterSaleState,
  saleStateLabelKey,
  saleStateOfMaster,
} from '../sale-state';

function main() {
  console.warn('🧪 Sale state suite (DOS/Rate#1188)');

  // An in-stock price wins over everything else.
  assert.equal(
    masterSaleState({
      minPrice: 20_990_000,
      listingCount: 3,
      metadata: { vn_sale_state: 'discontinued' },
      availabilityStatus: 'Discontinued',
    }),
    'on_sale'
  );

  // No in-stock price: the curated state, then sold out, then the launch
  // status, then not listed (known) or no stock (unknown).
  assert.equal(
    masterSaleState({
      minPrice: 0,
      listingCount: 2,
      metadata: { vn_sale_state: 'discontinued' },
    }),
    'discontinued'
  );
  assert.equal(
    masterSaleState({
      minPrice: null,
      listingCount: 0,
      metadata: { vn_sale_state: 'coming_soon' },
      availabilityStatus: 'Available. Released 2026, September 23',
    }),
    'coming_soon'
  );
  // An unknown curated value is ignored.
  assert.equal(
    masterSaleState({
      minPrice: 0,
      listingCount: 2,
      metadata: { vn_sale_state: 'on_sale' },
    }),
    'sold_out'
  );
  assert.equal(
    masterSaleState({
      minPrice: 0,
      listingCount: 0,
      availabilityStatus: 'Discontinued',
    }),
    'discontinued'
  );
  assert.equal(
    masterSaleState({
      minPrice: 0,
      listingCount: 0,
      availabilityStatus: 'Coming soon. Exp. release 2026, Q4',
    }),
    'coming_soon'
  );
  assert.equal(
    masterSaleState({
      minPrice: 0,
      listingCount: 0,
      availabilityStatus: 'Available. Released 2025, October',
    }),
    'not_listed'
  );
  assert.equal(masterSaleState({ minPrice: 0 }), 'no_stock');

  // A master row has no count of sold-out listings.
  assert.equal(saleStateOfMaster({ min_price: 0 }), 'no_stock');
  assert.equal(saleStateOfMaster({ min_price: 9_990_000 }), 'on_sale');
  assert.equal(
    saleStateOfMaster({
      min_price: null,
      specifications: { availability: { status: 'Discontinued' } },
    }),
    'discontinued'
  );

  // Every state but on_sale has a label and a hint in every locale.
  for (const locale of ['vi', 'en', 'cs']) {
    const messages = JSON.parse(
      readFileSync(
        new URL(`../../../locales/${locale}.json`, import.meta.url),
        'utf8'
      )
    ) as { saleState: Record<string, string> };
    for (const state of SALE_STATES) {
      if (state === 'on_sale') continue;
      const key = saleStateLabelKey(state);
      assert.ok(messages.saleState[key], `${locale} ${key}`);
      assert.ok(messages.saleState[`${key}Hint`], `${locale} ${key}Hint`);
    }
  }
  console.warn('✅ Sale state suite passed');
}

main();
