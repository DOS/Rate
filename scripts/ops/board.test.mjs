import assert from 'node:assert/strict';
import test from 'node:test';

import {
  declaredClaimants,
  formatLockMessage,
  parseLockMessage,
  resolveClaimant,
} from '../claim-lock.mjs';
import {
  STATUSES,
  agentLabel,
  forceReleaseBoard,
  isPoNick,
  labelChanges,
  lockComment,
} from './board.mjs';
import { ClaimError, acquireLock, forceRelease, releaseLock } from './lock.mjs';

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

// ---- Claim lock (DOS/Rate#1673) ----

const A = 'claude:local_aaaa1111';
const B = 'qwen:bbbb2222';

/**
 * An in-memory refs/claims store with GitHub's semantics: creating an
 * existing ref fails, and a replace applies only while the ref still points
 * at `before`. Every call yields to the event loop first, so calls from two
 * concurrent claims interleave as they would against the network.
 */
function fakeLocks() {
  const refs = new Map();
  const commits = new Map();
  const calls = {
    read: 0,
    readEmpty: 0,
    commit: 0,
    create: 0,
    replace: 0,
    remove: 0,
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  let next = 0;
  return {
    refs,
    calls,
    async read(number) {
      await tick();
      calls.read += 1;
      const sha = refs.get(number);
      if (!sha) {
        calls.readEmpty += 1;
        return null;
      }
      return { sha, ...parseLockMessage(commits.get(sha)), claimedAt: null };
    },
    async commit({ number, claimant, agent }) {
      await tick();
      calls.commit += 1;
      const sha = `c${(next += 1)}`;
      commits.set(
        sha,
        formatLockMessage({ repo: 'DOS/Rate', number, claimant, agent })
      );
      return sha;
    },
    async create(number, sha) {
      await tick();
      calls.create += 1;
      if (refs.has(number)) return false;
      refs.set(number, sha);
      return true;
    },
    async replace(number, before, after) {
      await tick();
      calls.replace += 1;
      if (refs.get(number) !== before) return false;
      refs.set(number, after);
      return true;
    },
    async remove(number) {
      await tick();
      calls.remove += 1;
      refs.delete(number);
    },
  };
}

const holder = async (api, n) => (await api.read(n))?.claimant ?? null;

test('lock: a free issue is won by the first claim', async () => {
  const api = fakeLocks();
  const r = await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  assert.equal(r.action, 'taken');
  assert.equal(await holder(api, 7), A);
});

test('lock: a claim on an issue another session holds fails naming it', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  await assert.rejects(
    acquireLock({ api, number: 7, claimant: B, agent: 'Core' }),
    (err) =>
      err instanceof ClaimError &&
      err.message.includes(`claimed by ${A} (Agent Ops)`) &&
      err.message.includes('--take-over')
  );
  assert.equal(await holder(api, 7), A);
});

test('lock: two concurrent claims, exactly one wins', async () => {
  const api = fakeLocks();
  const results = await Promise.allSettled([
    acquireLock({ api, number: 7, claimant: A, agent: 'Ops' }),
    acquireLock({ api, number: 7, claimant: B, agent: 'Core' }),
  ]);
  // Both saw a free lock before either created it: a real race.
  assert.ok(api.calls.readEmpty >= 2);
  assert.equal(api.calls.create, 2);
  const won = results.filter((r) => r.status === 'fulfilled');
  const lost = results.filter((r) => r.status === 'rejected');
  assert.equal(won.length, 1);
  assert.equal(won[0].value.action, 'taken');
  assert.equal(lost.length, 1);
  assert.ok(lost[0].reason instanceof ClaimError);
  const winner = await holder(api, 7);
  assert.match(lost[0].reason.message, new RegExp(`just taken by ${winner}`));
});

test('lock: ten concurrent claims, exactly one wins', async () => {
  const api = fakeLocks();
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      acquireLock({
        api,
        number: 9,
        claimant: `claude:local_s${i}xxxx`,
        agent: 'Ops',
      })
    )
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});

test('lock: re-claiming by the holder is idempotent and writes nothing', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  const before = { ...api.calls };
  const r = await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  assert.equal(r.action, 'held');
  assert.equal(api.calls.commit, before.commit);
  assert.equal(api.calls.create, before.create);
  assert.equal(await holder(api, 7), A);
});

test('lock: the same session claiming twice at once is not refused', async () => {
  const api = fakeLocks();
  const results = await Promise.all([
    acquireLock({ api, number: 7, claimant: A, agent: 'Ops' }),
    acquireLock({ api, number: 7, claimant: A, agent: 'Ops' }),
  ]);
  assert.deepEqual(results.map((r) => r.action).sort(), ['held', 'taken']);
});

test('lock: take-over replaces the holder', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  const r = await acquireLock({
    api,
    number: 7,
    claimant: B,
    agent: 'Core',
    takeOver: true,
  });
  assert.equal(r.action, 'taken-over');
  assert.equal(r.previous.claimant, A);
  assert.equal(await holder(api, 7), B);
});

test('lock: of two concurrent take-overs only one applies', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  const results = await Promise.allSettled([
    acquireLock({ api, number: 7, claimant: B, agent: 'Core', takeOver: true }),
    acquireLock({
      api,
      number: 7,
      claimant: 'claude:local_cccc3333',
      agent: 'Web',
      takeOver: true,
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(
    results.find((r) => r.status === 'rejected').reason.message,
    /changed during the take-over/
  );
});

test('lock: the holder releases it, and releasing a free issue is a no-op', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  const r = await releaseLock({
    api,
    number: 7,
    claimant: A,
    issueClosed: false,
  });
  assert.equal(r.action, 'released');
  assert.equal(await holder(api, 7), null);
  assert.equal(
    (await releaseLock({ api, number: 7, claimant: A, issueClosed: false }))
      .action,
    'none'
  );
  // Free again: another session can claim it.
  assert.equal(
    (await acquireLock({ api, number: 7, claimant: B, agent: 'Core' })).action,
    'taken'
  );
});

test('lock: another session cannot release an open issue', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  await assert.rejects(
    releaseLock({ api, number: 7, claimant: B, issueClosed: false }),
    /held by claude:local_aaaa1111 \(Agent Ops\), not qwen:bbbb2222.*--force-release/
  );
  assert.equal(await holder(api, 7), A);
});

test('lock: anyone may release the lock of a closed issue', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  const r = await releaseLock({
    api,
    number: 7,
    claimant: B,
    issueClosed: true,
  });
  assert.equal(r.action, 'released');
  assert.equal(r.previous.claimant, A);
});

test('lock: force-release clears whoever holds it', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  const r = await forceRelease({ api, number: 7 });
  assert.equal(r.action, 'released');
  assert.equal(r.previous.claimant, A);
  assert.equal(await holder(api, 7), null);
  assert.equal((await forceRelease({ api, number: 7 })).action, 'none');
});

test('force-release is for the PO and needs a reason', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  await assert.rejects(
    forceReleaseBoard({ number: 7, nick: 'Ops', reason: 'x', api }),
    /--agent PO/
  );
  await assert.rejects(
    forceReleaseBoard({ number: 7, nick: 'PO', reason: ' ', api }),
    /--reason/
  );
  assert.equal(await holder(api, 7), A);
  assert.equal(isPoNick(' po '), true);
  assert.equal(isPoNick('Ops'), false);
});

test('a claim adds the PO line label of the claimant', () => {
  assert.deepEqual(
    labelChanges(['status:ready'], 'in-progress', 'Ops', { po: 'claude' }),
    {
      add: ['status:in-progress', 'agent:ops', 'po:claude'],
      remove: ['status:ready'],
    }
  );
  assert.deepEqual(
    labelChanges(
      ['status:in-progress', 'agent:ops', 'po:claude'],
      'in-review',
      'Ops',
      {
        po: 'claude',
      }
    ),
    { add: ['status:in-review'], remove: ['status:in-progress'] }
  );
});

test("never claims an issue of the other PO's line without --take-over", () => {
  assert.throws(
    () =>
      labelChanges(['status:ready', 'po:qwen'], 'in-progress', 'Ops', {
        po: 'claude',
      }),
    /dispatched by po:qwen, another PO's line/
  );
  assert.deepEqual(
    labelChanges(['status:ready', 'po:qwen'], 'in-progress', 'Ops', {
      po: 'claude',
      takeOver: true,
    }),
    {
      add: ['status:in-progress', 'agent:ops', 'po:claude'],
      remove: ['status:ready', 'po:qwen'],
    }
  );
});

test('the lock comment names the claimant', () => {
  const base = {
    repo: 'DOS/Rate',
    number: 7,
    nick: 'Ops',
    claimant: A,
    status: 'in-progress',
  };
  assert.equal(lockComment({ ...base, lock: { action: 'held' } }), null);
  assert.match(
    lockComment({ ...base, lock: { action: 'taken' } }),
    /\*\*\[Agent: Ops\]\*\* Claim lock `refs\/claims\/7` taken by claimant `claude:local_aaaa1111`/
  );
  assert.match(
    lockComment({
      ...base,
      lock: { action: 'taken-over', previous: { claimant: B, agent: 'Core' } },
    }),
    /taken over by claimant `claude:local_aaaa1111` from qwen:bbbb2222 \(Agent Core\)/
  );
  assert.match(
    lockComment({
      ...base,
      claimant: B,
      status: 'done',
      lock: { action: 'released', previous: { claimant: A, agent: 'Ops' } },
    }),
    /because DOS\/Rate#7 is closed/
  );
});

test('claimant: flag, then RATE_CLAIMANT, then the Claude session id', () => {
  const env = {
    RATE_CLAIMANT: 'qwen:env12345',
    CLAUDE_CODE_HOST_SESSION_ID: 'local_host1234',
    CLAUDE_CODE_SESSION_ID: 'sess5678',
  };
  assert.equal(
    resolveClaimant({ flag: 'codex:flag1234', env }),
    'codex:flag1234'
  );
  assert.equal(resolveClaimant({ env }), 'qwen:env12345');
  assert.equal(
    resolveClaimant({ env: { ...env, RATE_CLAIMANT: '' } }),
    'claude:local_host1234'
  );
  assert.equal(
    resolveClaimant({ env: { CLAUDE_CODE_SESSION_ID: 'sess5678' } }),
    'claude:sess5678'
  );
  assert.throws(() => resolveClaimant({ env: {} }), /no claimant/);
  assert.throws(
    () => resolveClaimant({ flag: 'Ops', env: {} }),
    /invalid claimant/
  );
  assert.throws(
    () => resolveClaimant({ flag: 'claude:a b', env: {} }),
    /invalid claimant/
  );
});

test('lock message round-trips and PR bodies declare claimants', () => {
  const msg = formatLockMessage({
    repo: 'DOS/Rate',
    number: 7,
    claimant: A,
    agent: 'Ops',
  });
  assert.deepEqual(parseLockMessage(msg), { claimant: A, agent: 'Ops' });
  assert.deepEqual(parseLockMessage('random commit'), {
    claimant: null,
    agent: null,
  });
  assert.deepEqual(
    declaredClaimants(
      `Closes #7\n\nClaimant: \`${A}\`\n  claimant: ${A}\nClaimant: ${B}`
    ),
    [A, B]
  );
  assert.deepEqual(declaredClaimants('mentions Claimant: inline only'), []);
});
