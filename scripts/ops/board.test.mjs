import assert from 'node:assert/strict';
import test from 'node:test';

import { STATUSES, agentLabel, labelChanges } from './board.mjs';

test('agent labels are lowercase agent:<nick>', () => {
  assert.equal(agentLabel(' Guard '), 'agent:guard');
});

test('moves an issue to a new status and claims it', () => {
  assert.deepEqual(
    labelChanges(['bug', 'status:ready'], 'in-progress', 'Guard'),
    {
      add: ['status:in-progress', 'agent:guard'],
      remove: ['status:ready'],
    }
  );
});

test('leaves exactly one status label', () => {
  assert.deepEqual(
    labelChanges(
      ['status:in-progress', 'status:in-review', 'agent:guard'],
      'done',
      'Guard'
    ),
    { add: ['status:done'], remove: ['status:in-progress', 'status:in-review'] }
  );
});

test('never takes an issue another agent claimed without --take-over', () => {
  assert.throws(
    () =>
      labelChanges(
        ['status:in-progress', 'agent:crawl'],
        'in-progress',
        'Guard'
      ),
    /claimed by agent:crawl: pass --take-over/
  );
});

test('a deliberate hand-over replaces the previous agent label', () => {
  assert.deepEqual(
    labelChanges(['status:in-review', 'agent:crawl'], 'in-progress', 'Guard', {
      takeOver: true,
    }),
    {
      add: ['status:in-progress', 'agent:guard'],
      remove: ['status:in-review', 'agent:crawl'],
    }
  );
});

test('changes nothing when the labels already match', () => {
  assert.deepEqual(
    labelChanges(['status:in-review', 'agent:guard'], 'in-review', 'guard'),
    {
      add: [],
      remove: [],
    }
  );
});

test('backlog has no status label and removes any', () => {
  assert.equal(STATUSES.backlog.label, null);
  assert.deepEqual(labelChanges(['status:ready'], 'backlog', 'Guard'), {
    add: ['agent:guard'],
    remove: ['status:ready'],
  });
});

test('rejects an unknown status', () => {
  assert.throws(() => labelChanges([], 'blocked', 'Guard'), /unknown status/);
});

test('every status has a Project #9 option id', () => {
  for (const spec of Object.values(STATUSES))
    assert.match(spec.option, /^[0-9a-f]{8}$/);
});
