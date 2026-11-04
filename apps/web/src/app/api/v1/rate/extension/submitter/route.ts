import {
  BoundedSlidingWindowRateLimiter,
  extractClientRateLimitKey,
  payloadTooLargeResponse,
  rateLimitExceededResponse,
  readBoundedJsonBody,
} from '@/server/rate/api-handler';
import {
  EXTENSION_OBSERVATION_HEADERS,
  callObservationRpc,
  isExtensionObservationsEnabled,
  notEnabledResponse,
  observationResponse,
  parseSubmitterId,
  rpcFailureResponse,
} from '@/server/rate/extension-observations';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api.extension.submitter');

// Best-effort per-instance brakes; the RPCs hold the global ones.
const registerLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  maxBuckets: 2_000,
});
const deleteLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  maxBuckets: 2_000,
});

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: EXTENSION_OBSERVATION_HEADERS,
  });
}

/**
 * POST /api/v1/rate/extension/submitter: a new pseudonymous submitter id for
 * an install that opted in (DOS/Rate#1606). No body; the server creates the
 * id and records when.
 */
export async function POST(request: Request) {
  if (!isExtensionObservationsEnabled()) return notEnabledResponse();
  if (!registerLimiter.allow(extractClientRateLimitKey(request.headers))) {
    return rateLimitExceededResponse(
      'Too many requests; try again in a minute.',
      EXTENSION_OBSERVATION_HEADERS
    );
  }
  try {
    const { data, error } = await callObservationRpc(
      'register_extension_submitter'
    );
    if (error) return rpcFailureResponse(error);
    const submitterId = parseSubmitterId(data);
    if (!submitterId) {
      return observationResponse(502, {
        ok: false,
        code: 'PERSIST_FAILED',
        error: 'Could not create a submitter id.',
      });
    }
    return observationResponse(200, { ok: true, submitterId });
  } catch (err) {
    log.error('register_extension_submitter failed', {
      error: serializeError(err),
    });
    return rpcFailureResponse({});
  }
}

/**
 * DELETE /api/v1/rate/extension/submitter { submitterId }: deletes the
 * submitter and every observation it sent (the data subject's right to
 * erasure). The answer is the same whether or not the id existed.
 */
export async function DELETE(request: Request) {
  if (!isExtensionObservationsEnabled()) return notEnabledResponse();
  if (!deleteLimiter.allow(extractClientRateLimitKey(request.headers))) {
    return rateLimitExceededResponse(
      'Too many requests; try again in a minute.',
      EXTENSION_OBSERVATION_HEADERS
    );
  }
  const body = await readBoundedJsonBody(request, 1024);
  if (body.tooLarge)
    return payloadTooLargeResponse(EXTENSION_OBSERVATION_HEADERS);
  const submitterId = parseSubmitterId(
    (body.value as { submitterId?: unknown } | null)?.submitterId
  );
  if (!submitterId) {
    return observationResponse(400, {
      ok: false,
      code: 'INVALID_SUBMITTER',
      error: 'Provide submitterId as a uuid.',
    });
  }
  try {
    const { error } = await callObservationRpc('delete_extension_submitter', {
      p_submitter_id: submitterId,
    });
    if (error) return rpcFailureResponse(error);
    return observationResponse(200, { ok: true });
  } catch (err) {
    log.error('delete_extension_submitter failed', {
      error: serializeError(err),
    });
    return rpcFailureResponse({});
  }
}
