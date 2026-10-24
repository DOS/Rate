import assert from 'node:assert/strict';
import { createLogger, redact, serializeError } from '../logger';

function capture(fn: () => void): string[] {
  const lines: string[] = [];
  const orig = { log: console.log, error: console.error };
  console.log = (line: string) => lines.push(line);
  console.error = (line: string) => lines.push(line);
  try {
    fn();
  } finally {
    console.log = orig.log;
    console.error = orig.error;
  }
  return lines;
}

function main() {
  console.warn('🧪 Structured logger suite (#240)');

  // One JSON object per line with level, scope and message.
  const [line] = capture(() =>
    createLogger('api.test').error('rpc failed', {
      code: '42501',
      masterId: 'm-1',
    })
  );
  const parsed = JSON.parse(line!);
  assert.equal(parsed.level, 'error');
  assert.equal(parsed.scope, 'api.test');
  assert.equal(parsed.msg, 'rpc failed');
  assert.equal(parsed.code, '42501');
  assert.equal(parsed.masterId, 'm-1');
  assert.ok(!Number.isNaN(Date.parse(parsed.ts)));

  // Secret-looking keys are redacted at any depth.
  const red = redact({
    authorization: 'Bearer abc',
    nested: { accessToken: 't', supabase_service_role_key: 'k', ok: 1 },
    headers: [{ cookie: 'sb=1' }],
  }) as Record<string, unknown>;
  assert.equal(red.authorization, '[redacted]');
  assert.deepEqual(red.nested, {
    accessToken: '[redacted]',
    supabase_service_role_key: '[redacted]',
    ok: 1,
  });
  assert.deepEqual(red.headers, [{ cookie: '[redacted]' }]);

  // Errors keep name/message/code; stacks stay out of production logs.
  const err = Object.assign(new Error('boom'), { code: 'XX000' });
  const env = process.env as Record<string, string | undefined>;
  const prevEnv = env.NODE_ENV;
  env.NODE_ENV = 'production';
  try {
    const s = serializeError(err);
    assert.equal(s.message, 'boom');
    assert.equal(s.code, 'XX000');
    assert.equal(s.stack, undefined);
    // debug is dropped in production
    assert.equal(capture(() => createLogger('x').debug('hidden')).length, 0);
  } finally {
    if (prevEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = prevEnv;
  }

  // Emails are personal data: masked under email keys and inside any string.
  const pii = redact({
    subscriber_email: 'a@rate.test',
    message:
      'duplicate key: Key (email)=(Victim.User@Example.com) already exists',
  }) as Record<string, unknown>;
  assert.equal(pii.subscriber_email, '[redacted]');
  assert.equal(
    pii.message,
    'duplicate key: Key (email)=([email]) already exists'
  );
  // PostgREST errors are plain objects
  assert.deepEqual(
    serializeError({ code: 'PGRST202', message: 'missing', apikey: 'x' }),
    {
      code: 'PGRST202',
      message: 'missing',
      apikey: '[redacted]',
    }
  );

  // Circular references, shared DAG sub-objects, BigInt, NaN, and boundary-straddling emails/tokens (#844).
  const sharedDag = { ok: true };
  const cyclic: Record<string, unknown> = {
    first: sharedDag,
    second: sharedDag,
    big: BigInt('9007199254740993'),
    nanVal: Number.NaN,
    bearerMsg: `Authorization: Bearer ${'s'.repeat(16)}`,
    boundaryEmail: `${'a'.repeat(1995)}victim@example.com`,
  };
  cyclic.self = cyclic;
  const redactedCyclic = redact(cyclic) as Record<string, unknown>;
  assert.equal(redactedCyclic.self, '[Circular]');
  assert.deepEqual(redactedCyclic.first, { ok: true });
  assert.deepEqual(redactedCyclic.second, { ok: true });
  assert.equal(redactedCyclic.big, '9007199254740993');
  assert.equal(redactedCyclic.nanVal, null);
  assert.equal(redactedCyclic.bearerMsg, 'Authorization: Bearer [redacted]');
  assert.equal(String(redactedCyclic.boundaryEmail).includes('victim'), false);

  // Caller fields cannot overwrite ts/level/scope/msg, scope is bounded, and stacks are scrubbed (#936).
  const [protectedLine] = capture(() =>
    createLogger(`  api.scope\u0000${'s'.repeat(200)}  `).warn('true message', {
      level: 'debug',
      scope: 'forged.scope',
      msg: 'forged message',
      ts: '1970-01-01T00:00:00.000Z',
      extra: 'ok',
    })
  );
  const parsedProtected = JSON.parse(protectedLine!);
  assert.equal(parsedProtected.level, 'warn');
  assert.equal(parsedProtected.msg, 'true message');
  assert.equal(parsedProtected.scope.length, 128);
  assert.notEqual(parsedProtected.scope, 'forged.scope');
  assert.notEqual(parsedProtected.ts, '1970-01-01T00:00:00.000Z');
  assert.equal(parsedProtected.extra, 'ok');

  const stackErr = new Error('fail');
  stackErr.stack =
    'Error: fail at Bearer secretToken123456 and user@example.com';
  const serializedNonProd = serializeError(stackErr);
  assert.equal(
    String(serializedNonProd.stack).includes('secretToken123456'),
    false
  );
  assert.equal(
    String(serializedNonProd.stack).includes('user@example.com'),
    false
  );

  console.warn('✅ Structured logger suite passed');
}

main();
