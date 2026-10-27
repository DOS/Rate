import assert from 'node:assert/strict';
import { wrapFocusTarget } from '../focus-trap';

const items = ['close', 'home', 'leaderboard', 'watchlist'];

assert.equal(
  wrapFocusTarget(items, 'watchlist', false),
  'close',
  'Tab on the last element wraps to the first'
);
assert.equal(
  wrapFocusTarget(items, 'close', true),
  'watchlist',
  'Shift+Tab on the first element wraps to the last'
);
assert.equal(
  wrapFocusTarget(items, 'home', false),
  null,
  'Tab inside the trap is left to the browser'
);
assert.equal(
  wrapFocusTarget(items, 'leaderboard', true),
  null,
  'Shift+Tab inside the trap is left to the browser'
);
assert.equal(
  wrapFocusTarget(items, 'hero-search', false),
  'close',
  'Tab from outside the trap comes back to its first element'
);
assert.equal(
  wrapFocusTarget(items, null, true),
  'watchlist',
  'Shift+Tab with nothing focused comes back to the last element'
);
assert.equal(
  wrapFocusTarget(['only'], 'only', false),
  'only',
  'A single element keeps focus'
);
assert.equal(
  wrapFocusTarget([], 'home', false),
  null,
  'An empty trap leaves focus alone'
);

console.log('focus-trap: ok');
