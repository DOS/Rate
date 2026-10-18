import assert from 'node:assert/strict';
import test from 'node:test';

import { isProcessAlive, staleStackPids } from './stale-stacks.mjs';

const alive = (pids) => (pid) => pids.includes(pid);

test('finds stacks whose owner is gone, once per PID', () => {
  const names = [
    'rate-e2e-111-db',
    'rate-e2e-111-rest',
    'rate-e2e-111',
    'rate-e2e-222-db',
    'rate-e2e-222-rest',
  ];
  assert.deepEqual(staleStackPids(names, alive([222]), 1), [111]);
});

test('keeps stacks of live runs and of this run', () => {
  const names = ['rate-e2e-5-db', 'rate-e2e-6-rest', 'rate-e2e-7'];
  assert.deepEqual(staleStackPids(names, alive([5, 6]), 7), []);
});

test('ignores names that are not E2E stacks', () => {
  const names = [
    'rate-migration-replay-1',
    'rate-e2e-abc-db',
    'rate-e2e-12-web',
    'other-rate-e2e-3-db',
    'postgres',
  ];
  assert.deepEqual(staleStackPids(names, alive([]), 1), []);
});

test('tolerates whitespace from docker output', () => {
  assert.deepEqual(staleStackPids(['rate-e2e-9-db\r'], alive([]), 1), [9]);
});

test('this process is alive', () => {
  assert.equal(isProcessAlive(process.pid), true);
});
