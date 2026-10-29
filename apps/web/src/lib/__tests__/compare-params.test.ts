import assert from 'node:assert/strict';
import { compareCategoryParam } from '../compare-params';

// Compare links written with ?cat= open on their category (DOS/Rate#1303).
assert.equal(compareCategoryParam({ cat: 'earbuds' }), 'earbuds');
assert.equal(compareCategoryParam({ category: 'laptops' }), 'laptops');
assert.equal(
  compareCategoryParam({ category: 'laptops', cat: 'earbuds' }),
  'laptops',
  'category wins'
);
assert.equal(compareCategoryParam({ cat: ['tablets', 'x'] }), 'tablets');
assert.equal(compareCategoryParam({}), undefined);
assert.equal(compareCategoryParam({ category: '', cat: 'earbuds' }), 'earbuds');
console.log('✅ compare params');
