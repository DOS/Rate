import assert from 'node:assert/strict';
import test from 'node:test';

import {
  declaredClaimants,
  formatLockMessage,
  formatReleaseMessage,
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
  setBoard,
} from './board.mjs';
import {
  ClaimError,
  acquireLock,
  forceRelease,
  githubLockApi,
  isStale,
  releaseLock,
} from './lock.mjs';

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
 * concurrent claims interleave as they would against the network. A commit
 * is dated `store.now` (null: unknown, as before DOS/Rate#1675's tests).
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
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  let next = 0;
  const store = {
    refs,
    calls,
    now: null,
    async read(number) {
      await tick();
      calls.read += 1;
      const sha = refs.get(number);
      if (!sha) {
        calls.readEmpty += 1;
        return null;
      }
      const { message, at } = commits.get(sha);
      return { sha, ...parseLockMessage(message), claimedAt: at };
    },
    async commit({ number, claimant, agent, released = false }) {
      await tick();
      calls.commit += 1;
      const sha = `c${(next += 1)}`;
      const repo = 'DOS/Rate';
      commits.set(sha, {
        message: released
          ? formatReleaseMessage({ repo, number, releasedBy: claimant, agent })
          : formatLockMessage({ repo, number, claimant, agent }),
        at: store.now,
      });
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
  };
  return store;
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
    /held by claude:local_aaaa1111 \(Agent Ops\), not this session.*--force-release/
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

test('claimant: flag, then the Claude session ids, then RATE_CLAIMANT', () => {
  const env = {
    RATE_CLAIMANT: 'qwen:env12345',
    CLAUDE_CODE_HOST_SESSION_ID: 'local_host1234',
    CLAUDE_CODE_SESSION_ID: 'sess5678',
  };
  assert.equal(
    resolveClaimant({ flag: 'codex:flag1234', env }),
    'codex:flag1234'
  );
  // A RATE_CLAIMANT left in a shell profile never overrides a Claude session.
  assert.equal(resolveClaimant({ env }), 'claude:local_host1234');
  assert.equal(
    resolveClaimant({ env: { ...env, CLAUDE_CODE_HOST_SESSION_ID: '' } }),
    'claude:sess5678'
  );
  assert.equal(
    resolveClaimant({ env: { RATE_CLAIMANT: 'qwen:env12345' } }),
    'qwen:env12345'
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
  assert.deepEqual(parseLockMessage(msg), {
    claimant: A,
    agent: 'Ops',
    released: false,
  });
  assert.deepEqual(parseLockMessage('random commit'), {
    claimant: null,
    agent: null,
    released: false,
  });
  // A tombstone is a free lock, whoever released it.
  const tomb = formatReleaseMessage({
    repo: 'DOS/Rate',
    number: 7,
    releasedBy: A,
    agent: 'Ops',
  });
  assert.equal(tomb, `release: DOS/Rate#7\n\nReleased-By: ${A}\nAgent: Ops\n`);
  assert.deepEqual(parseLockMessage(tomb), {
    claimant: null,
    agent: 'Ops',
    released: true,
    releasedBy: A,
  });
  assert.deepEqual(
    parseLockMessage(
      formatReleaseMessage({ repo: 'DOS/Rate', number: 7, agent: 'PO' })
    ),
    { claimant: null, agent: 'PO', released: true, releasedBy: null }
  );
  assert.deepEqual(
    declaredClaimants(
      `Closes #7\n\nClaimant: \`${A}\`\n  claimant: ${A}\nClaimant: ${B}`
    ),
    [A, B]
  );
  assert.deepEqual(declaredClaimants('mentions Claimant: inline only'), []);
});

test('lock: a lockless issue already claimed by labels needs --adopt', async () => {
  const api = fakeLocks();
  await assert.rejects(
    acquireLock({
      api,
      number: 7,
      claimant: A,
      agent: 'Core',
      claimedWithoutLock: true,
    }),
    /claim made before the lock.*--adopt/
  );
  assert.equal(await holder(api, 7), null);
  const r = await acquireLock({
    api,
    number: 7,
    claimant: A,
    agent: 'Core',
    claimedWithoutLock: true,
    adopt: true,
  });
  assert.equal(r.action, 'taken');
});

// ---- githubLockApi against a fake `gh` ----

const ok = (json) => ({
  ok: true,
  status: 200,
  stdout: JSON.stringify(json),
  stderr: '',
});
const err = (status, message) => ({
  ok: false,
  status,
  stdout: '',
  stderr: `gh: ${message} (HTTP ${status})`,
});

/** A fake `gh` that answers by the first matching [pattern, reply]. */
function fakeGh(routes) {
  const calls = [];
  const call = (args) => {
    calls.push(args.join(' '));
    const line = args.join(' ');
    for (const [pattern, reply] of routes) {
      if (pattern.test(line))
        return typeof reply === 'function' ? reply(line) : reply;
    }
    throw new Error(`unexpected gh call: ${line}`);
  };
  return { call, calls };
}

const lockMsg = formatLockMessage({
  repo: 'DOS/Rate',
  number: 7,
  claimant: A,
  agent: 'Ops',
});

test('github lock api: reads a lock, a missing one and only the exact ref', async () => {
  const held = githubLockApi('DOS/Rate', {
    call: fakeGh([
      [
        /git\/ref\/claims\/7$/,
        ok({ ref: 'refs/claims/7', object: { sha: 's1' } }),
      ],
      [/git\/commits\/s1$/, ok({ message: lockMsg, committer: { date: 'd' } })],
    ]).call,
  });
  assert.deepEqual(await held.read(7), {
    sha: 's1',
    claimant: A,
    agent: 'Ops',
    released: false,
    claimedAt: 'd',
  });
  const missing = githubLockApi('DOS/Rate', {
    call: fakeGh([[/git\/ref\/claims\/7$/, err(404, 'Not Found')]]).call,
  });
  assert.equal(await missing.read(7), null);
  const other = githubLockApi('DOS/Rate', {
    call: fakeGh([
      [
        /git\/ref\/claims\/7$/,
        ok({ ref: 'refs/claims/70', object: { sha: 's9' } }),
      ],
    ]).call,
  });
  assert.equal(await other.read(7), null);
  const broken = githubLockApi('DOS/Rate', {
    call: fakeGh([[/git\/ref\/claims\/7$/, err(502, 'Bad Gateway')]]).call,
  });
  await assert.rejects(broken.read(7), /reading refs\/claims\/7 failed/);
});

test('github lock api: create tells a lost race from a real failure', async () => {
  const api = (reply) =>
    githubLockApi('DOS/Rate', {
      call: fakeGh([[/git\/refs -f ref=/, reply]]).call,
    });
  assert.equal(await api(ok({})).create(7, 's1'), true);
  assert.equal(
    await api(err(422, 'Reference already exists')).create(7, 's1'),
    false
  );
  await assert.rejects(
    api(err(422, 'Invalid request')).create(7, 's1'),
    /creating/
  );
  await assert.rejects(api(err(403, 'Forbidden')).create(7, 's1'), /creating/);
});

test('github lock api: a release writes a tombstone commit and never deletes', async () => {
  const fake = fakeGh([
    [/git\/blobs/, ok({ sha: 'b1' })],
    [/git\/trees/, ok({ sha: 't1' })],
    [/git\/commits -f message=/, ok({ sha: 'k1' })],
  ]);
  const api = githubLockApi('DOS/Rate', { call: fake.call });
  assert.equal('remove' in api, false);
  const sha = await api.commit({
    number: 7,
    claimant: A,
    agent: 'Ops',
    parent: 's1',
    released: true,
  });
  assert.equal(sha, 'k1');
  const write = fake.calls.find((c) => c.includes('git/commits -f message='));
  assert.ok(write.includes(`message=release: DOS/Rate#7\n\nReleased-By: ${A}`));
  assert.ok(write.includes('parents[]=s1'));
  assert.ok(
    fake.calls.find((c) => c.includes('git/blobs')).includes('"released":true')
  );
  assert.ok(!fake.calls.some((c) => c.includes('DELETE')));
});

test('github lock api: a failed compare-and-swap is judged by re-reading the ref', async () => {
  const api = (sha) =>
    githubLockApi('DOS/Rate', {
      call: fakeGh([
        [/--jq \{id: \.node_id\}/, ok({ id: 'R_1' })],
        [/updateRefs/, err(500, 'Something went wrong')],
        [/git\/ref\/claims\/7$/, ok({ ref: 'refs/claims/7', object: { sha } })],
        [/git\/commits\//, ok({ message: lockMsg, committer: { date: 'd' } })],
      ]).call,
    });
  assert.equal(await api('moved').replace(7, 'before', 'after'), false);
  assert.equal(await api('after').replace(7, 'before', 'after'), true);
  await assert.rejects(
    api('before').replace(7, 'before', 'after'),
    /replacing/
  );
});

// ---- setBoard with fake I/O ----

function fakeIo(labels, { state = 'OPEN', closedAt = null } = {}) {
  const log = [];
  return {
    log,
    io: {
      ghJson(args) {
        if (args[1] === 'graphql') {
          return {
            data: {
              repository: {
                issue: {
                  url: 'https://github.com/DOS/Rate/issues/7',
                  state,
                  timelineItems: {
                    nodes: closedAt ? [{ createdAt: closedAt }] : [],
                  },
                  labels: { nodes: labels.map((name) => ({ name })) },
                  projectItems: {
                    nodes: [{ id: 'ITEM', project: { number: 9 } }],
                  },
                },
              },
            },
          };
        }
        throw new Error(`unexpected ghJson ${args.join(' ')}`);
      },
      gh(args) {
        log.push(args.slice(0, 2).join(' '));
        return { status: 0, stdout: '', stderr: '' };
      },
    },
  };
}

function loggingLocks(log) {
  const api = fakeLocks();
  const { create, replace } = api;
  // Wrapped in place, so the test can still set api.now.
  api.create = async (n, sha) => {
    log.push('lock create');
    return create(n, sha);
  };
  api.replace = async (n, before, after) => {
    log.push('lock replace');
    return replace(n, before, after);
  };
  return api;
}

test('setBoard: takes the lock, comments, then labels and board', async () => {
  const { io, log } = fakeIo(['status:ready']);
  const api = loggingLocks(log);
  const out = await setBoard({
    number: 7,
    status: 'in-progress',
    nick: 'Ops',
    claimant: A,
    api,
    io,
  });
  assert.match(out, /lock taken/);
  assert.deepEqual(log.slice(0, 3), [
    'lock create',
    'issue comment',
    'label create',
  ]);
  assert.ok(log.indexOf('issue edit') > log.indexOf('issue comment'));
  assert.ok(log.includes('project item-edit'));
  assert.equal(log.at(-1), 'workflow run');
});

test('setBoard: a lost claim changes no label, board or comment', async () => {
  const { io, log } = fakeIo(['status:ready']);
  const api = loggingLocks(log);
  await acquireLock({ api, number: 7, claimant: B, agent: 'Ops' });
  log.length = 0;
  await assert.rejects(
    setBoard({
      number: 7,
      status: 'in-progress',
      nick: 'Ops',
      claimant: A,
      api,
      io,
    }),
    /claimed by qwen:bbbb2222/
  );
  assert.deepEqual(log, []);
});

test('setBoard: a refused release changes nothing', async () => {
  const { io, log } = fakeIo(['status:in-review', 'agent:ops']);
  const api = loggingLocks(log);
  await acquireLock({ api, number: 7, claimant: B, agent: 'Ops' });
  log.length = 0;
  await assert.rejects(
    setBoard({ number: 7, status: 'ready', nick: 'Ops', claimant: A, api, io }),
    /only the holder releases it/
  );
  assert.deepEqual(log, []);
});

test('setBoard: a legacy claim needs --adopt, then the holder releases on done', async () => {
  const { io, log } = fakeIo(['status:in-progress', 'agent:ops']);
  const api = loggingLocks(log);
  await assert.rejects(
    setBoard({
      number: 7,
      status: 'in-review',
      nick: 'Ops',
      claimant: A,
      api,
      io,
    }),
    /--adopt/
  );
  assert.deepEqual(log, []);
  await setBoard({
    number: 7,
    status: 'in-review',
    nick: 'Ops',
    claimant: A,
    adopt: true,
    api,
    io,
  });
  assert.equal(await holder(api, 7), A);
  const out = await setBoard({
    number: 7,
    status: 'done',
    nick: 'Ops',
    claimant: A,
    api,
    io,
  });
  assert.match(out, /lock released/);
  assert.equal(await holder(api, 7), null);
});

test('setBoard: the PO marks a closed issue done whoever holds the lock', async () => {
  const { io } = fakeIo(['status:in-review', 'agent:ops'], { state: 'CLOSED' });
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: B, agent: 'Ops' });
  const out = await setBoard({
    number: 7,
    status: 'done',
    nick: 'Ops',
    claimant: A,
    api,
    io,
  });
  assert.match(out, /lock released/);
});

// ---- DOS/Rate#1675: tombstone release, stale locks ----

const T_CLAIM = '2026-11-10T10:00:00Z';
const T_CLOSE = '2026-11-12T10:00:00Z';
const T_LATER = '2026-11-14T10:00:00Z';

test('release: leaves a tombstone, which reads as free and is claimed by compare-and-swap', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  await releaseLock({ api, number: 7, claimant: A, agent: 'Ops' });
  assert.ok(api.refs.has(7), 'the ref is kept');
  const tomb = await api.read(7);
  assert.equal(tomb.released, true);
  assert.equal(tomb.releasedBy, A);
  assert.equal(await holder(api, 7), null);
  // Releasing a tombstone or force-releasing it does nothing.
  assert.equal(
    (await releaseLock({ api, number: 7, claimant: B })).action,
    'none'
  );
  assert.equal((await forceRelease({ api, number: 7 })).action, 'none');
  const createsBefore = api.calls.create;
  const r = await acquireLock({ api, number: 7, claimant: B, agent: 'Core' });
  assert.deepEqual(r, { action: 'taken' });
  assert.equal(api.calls.create, createsBefore, 'claimed by replace');
  assert.equal(await holder(api, 7), B);
});

test('release: two concurrent claims of a tombstone, exactly one wins', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  await releaseLock({ api, number: 7, claimant: A });
  const results = await Promise.allSettled([
    acquireLock({ api, number: 7, claimant: B, agent: 'Core' }),
    acquireLock({
      api,
      number: 7,
      claimant: 'claude:local_cccc3333',
      agent: 'Web',
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const winner = await holder(api, 7);
  assert.match(
    results.find((r) => r.status === 'rejected').reason.message,
    new RegExp(`just taken by ${winner}`)
  );
});

test('release: a take-over landing between the read and the release survives it', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  // B takes over right after A's release has read the lock.
  const racing = {
    ...api,
    async commit(args) {
      if (args.released) {
        await acquireLock({
          api,
          number: 7,
          claimant: B,
          agent: 'Core',
          takeOver: true,
        });
      }
      return api.commit(args);
    },
  };
  await assert.rejects(
    releaseLock({ api: racing, number: 7, claimant: A }),
    (e) => e instanceof ClaimError && /changed while releasing/.test(e.message)
  );
  assert.equal(await holder(api, 7), B);
});

test('release: a force-release does not remove a lock that moved meanwhile', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  const racing = {
    ...api,
    async commit(args) {
      await acquireLock({
        api,
        number: 7,
        claimant: B,
        agent: 'Core',
        takeOver: true,
      });
      return api.commit(args);
    },
  };
  await assert.rejects(
    forceRelease({ api: racing, number: 7, agent: 'PO' }),
    /changed while releasing/
  );
  assert.equal(await holder(api, 7), B);
  const r = await forceRelease({ api, number: 7, claimant: A, agent: 'PO' });
  assert.equal(r.previous.claimant, B);
  assert.equal((await api.read(7)).released, true);
});

test('release: the tombstone of a legacy label claim still needs --adopt', async () => {
  const api = fakeLocks();
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  await releaseLock({ api, number: 7, claimant: A });
  await assert.rejects(
    acquireLock({
      api,
      number: 7,
      claimant: B,
      agent: 'Core',
      claimedWithoutLock: true,
    }),
    /--adopt/
  );
});

test('stale: a lock is stale only when taken before the last close', () => {
  const lock = { claimant: A, claimedAt: T_CLAIM, released: false };
  assert.equal(isStale(lock, T_CLOSE), true);
  assert.equal(isStale({ ...lock, claimedAt: T_LATER }, T_CLOSE), false);
  assert.equal(isStale(lock, null), false);
  assert.equal(isStale({ ...lock, claimedAt: null }, T_CLOSE), false);
  assert.equal(isStale({ ...lock, released: true }, T_CLOSE), false);
  assert.equal(isStale(null, T_CLOSE), false);
  assert.equal(isStale(lock, 'not a date'), false);
});

test('stale: claiming a reopened issue replaces a lock from before the close', async () => {
  const api = fakeLocks();
  api.now = T_CLAIM;
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  api.now = T_LATER;
  const r = await acquireLock({
    api,
    number: 7,
    claimant: B,
    agent: 'Core',
    claimedWithoutLock: true, // its status label is as stale as the lock
    closedAt: T_CLOSE,
  });
  assert.equal(r.action, 'taken');
  assert.equal(r.previous.claimant, A);
  assert.equal(r.previous.stale, true);
  assert.equal(await holder(api, 7), B);
  // The new lock is newer than the close: no longer stale.
  await assert.rejects(
    acquireLock({
      api,
      number: 7,
      claimant: A,
      agent: 'Ops',
      closedAt: T_CLOSE,
    }),
    /claimed by qwen:bbbb2222/
  );
});

test('stale: a lock taken after the last close is not stale', async () => {
  const api = fakeLocks();
  api.now = T_LATER;
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  await assert.rejects(
    acquireLock({
      api,
      number: 7,
      claimant: B,
      agent: 'Core',
      closedAt: T_CLOSE,
    }),
    /claimed by claude:local_aaaa1111/
  );
});

test('stale: the holder re-claiming a reopened issue renews its lock', async () => {
  const api = fakeLocks();
  api.now = T_CLAIM;
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  api.now = T_LATER;
  const r = await acquireLock({
    api,
    number: 7,
    claimant: A,
    agent: 'Ops',
    closedAt: T_CLOSE,
  });
  assert.equal(r.action, 'taken');
  assert.equal((await api.read(7)).claimedAt, T_LATER);
  // So another session can no longer take it as stale.
  await assert.rejects(
    acquireLock({
      api,
      number: 7,
      claimant: B,
      agent: 'Core',
      closedAt: T_CLOSE,
    }),
    /claimed by claude:local_aaaa1111/
  );
});

test('stale: two sessions claiming the same stale lock, exactly one wins', async () => {
  const api = fakeLocks();
  api.now = T_CLAIM;
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  api.now = T_LATER;
  const results = await Promise.allSettled([
    acquireLock({
      api,
      number: 7,
      claimant: B,
      agent: 'Core',
      closedAt: T_CLOSE,
    }),
    acquireLock({
      api,
      number: 7,
      claimant: 'claude:local_cccc3333',
      agent: 'Web',
      closedAt: T_CLOSE,
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(
    results.find((r) => r.status === 'rejected').reason.message,
    /just taken by/
  );
});

test('stale: anyone may release a stale lock of a reopened issue', async () => {
  const api = fakeLocks();
  api.now = T_CLAIM;
  await acquireLock({ api, number: 7, claimant: A, agent: 'Ops' });
  const r = await releaseLock({
    api,
    number: 7,
    claimant: B,
    agent: 'PO',
    issueClosed: false,
    closedAt: T_CLOSE,
  });
  assert.equal(r.action, 'released');
  assert.equal(r.previous.stale, true);
  assert.equal(await holder(api, 7), null);
});

test('stale: the agent label of a stale claim needs no --take-over, the other PO line still does', () => {
  assert.deepEqual(
    labelChanges(['status:in-review', 'agent:web'], 'in-progress', 'Ops', {
      staleClaim: true,
      po: 'claude',
    }),
    {
      add: ['status:in-progress', 'agent:ops', 'po:claude'],
      remove: ['status:in-review', 'agent:web'],
    }
  );
  assert.throws(
    () =>
      labelChanges(
        ['status:in-review', 'agent:web', 'po:qwen'],
        'in-progress',
        'Ops',
        {
          staleClaim: true,
          po: 'claude',
        }
      ),
    /another PO's line/
  );
});

test('stale and tombstone lock comments', () => {
  const base = {
    repo: 'DOS/Rate',
    number: 7,
    nick: 'Ops',
    claimant: B,
    status: 'in-progress',
  };
  assert.match(
    lockComment({
      ...base,
      lock: {
        action: 'taken',
        previous: { claimant: A, agent: 'Web', stale: true },
      },
    }),
    /taken by claimant `qwen:bbbb2222`, replacing the stale lock of claude:local_aaaa1111 \(Agent Web\) from before DOS\/Rate#7 was last closed/
  );
  assert.match(
    lockComment({
      ...base,
      status: 'ready',
      lock: {
        action: 'released',
        previous: { claimant: A, agent: 'Web', stale: true },
      },
    }),
    /released by claimant `qwen:bbbb2222` because it was taken before DOS\/Rate#7 was last closed/
  );
});

test('setBoard: claims a reopened issue over a stale lock and its agent label', async () => {
  const { io, log } = fakeIo(['status:in-review', 'agent:web'], {
    closedAt: T_CLOSE,
  });
  const api = loggingLocks(log);
  api.now = T_CLAIM;
  await acquireLock({ api, number: 7, claimant: B, agent: 'Web' });
  api.now = T_LATER;
  log.length = 0;
  const out = await setBoard({
    number: 7,
    status: 'in-progress',
    nick: 'Ops',
    claimant: A,
    api,
    io,
  });
  assert.match(out, /lock taken/);
  assert.equal(await holder(api, 7), A);
  assert.deepEqual(log.slice(0, 2), ['lock replace', 'issue comment']);
});

test('setBoard: a reopened issue with a fresh lock is still refused', async () => {
  const { io, log } = fakeIo(['status:in-progress', 'agent:ops'], {
    closedAt: T_CLOSE,
  });
  const api = loggingLocks(log);
  api.now = T_LATER;
  await acquireLock({ api, number: 7, claimant: B, agent: 'Ops' });
  log.length = 0;
  await assert.rejects(
    setBoard({
      number: 7,
      status: 'in-progress',
      nick: 'Ops',
      claimant: A,
      api,
      io,
    }),
    /claimed by qwen:bbbb2222/
  );
  assert.deepEqual(log, []);
});

test('setBoard: release and done leave a tombstone', async () => {
  const { io, log } = fakeIo(['status:ready']);
  const api = loggingLocks(log);
  await setBoard({
    number: 7,
    status: 'in-progress',
    nick: 'Ops',
    claimant: A,
    api,
    io,
  });
  log.length = 0;
  const out = await setBoard({
    number: 7,
    status: 'ready',
    nick: 'Ops',
    claimant: A,
    api,
    io,
  });
  assert.match(out, /lock released/);
  assert.equal(log[0], 'lock replace');
  assert.equal((await api.read(7)).released, true);
  assert.equal((await api.read(7)).agent, 'Ops');
});
