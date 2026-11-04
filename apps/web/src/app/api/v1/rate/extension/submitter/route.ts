import {
  BoundedSlidingWindowRateLimiter,
  extractClientRateLimitKey,
  payloadTooLargeResponse,
  rateLimitExceededResponse,
  readBoundedJsonBody,
} from '@/server/rate/api-handler';
import {
  callObservationRpc,
  hasNetworkHashSalt,
  ingestKey,
  isExtensionObservationsEnabled,
  isJsonRequest,
  isWebPageOrigin,
  networkHashFor,
  notEnabledResponse,
  notJsonResponse,
  observationHeaders,
  observationOptions,
  observationResponse,
  parseSubmitterId,
  rpcFailureResponse,
  unavailableResponse,
  webPageRefusedResponse,
} from '@/server/rate/extension-observations';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api.extension.submitter');

// Best-effort per-instance brakes; the RPCs hold the real limits.
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

export function OPTIONS(request: Request) {
  return observationOptions(request);
}

/**
 * POST /api/v1/rate/extension/submitter: a new pseudonymous submitter id for
 * an install that opted in (DOS/Rate#1606). No body; the server creates the
 * id and records when, and the RPC limits new ids per network.
 */
export async function POST(request: Request) {
  if (!isExtensionObservationsEnabled()) return notEnabledResponse(request);
  if (isWebPageOrigin(request)) return webPageRefusedResponse(request);
  const key = ingestKey();
  if (!key || !hasNetworkHashSalt()) return unavailableResponse(request);
  const clientIp = extractClientRateLimitKey(request.headers);
  if (!registerLimiter.allow(clientIp)) {
    return rateLimitExceededResponse(
      'Too many requests; try again in a minute.',
      observationHeaders(request)
    );
  }
  try {
    const { data, error } = await callObservationRpc(
      'register_extension_submitter',
      { p_ingest_key: key, p_network_hash: networkHashFor(clientIp) }
    );
    if (error) return rpcFailureResponse(request, error);
    const submitterId = parseSubmitterId(data);
    if (!submitterId) {
      return observationResponse(request, 502, {
        ok: false,
        code: 'PERSIST_FAILED',
        error: 'Could not create a submitter id.',
      });
    }
    return observationResponse(request, 200, { ok: true, submitterId });
  } catch (err) {
    log.error('register_extension_submitter failed', {
      error: serializeError(err),
    });
    return rpcFailureResponse(request, {});
  }
}

/**
 * DELETE /api/v1/rate/extension/submitter { submitterId }: deletes the
 * submitter and every observation it sent (the data subject's right to
 * erasure). The answer is the same whether or not the id existed.
 */
export async function DELETE(request: Request) {
  if (!isExtensionObservationsEnabled()) return notEnabledResponse(request);
  if (isWebPageOrigin(request)) return webPageRefusedResponse(request);
  if (!isJsonRequest(request)) return notJsonResponse(request);
  if (!deleteLimiter.allow(extractClientRateLimitKey(request.headers))) {
    return rateLimitExceededResponse(
      'Too many requests; try again in a minute.',
      observationHeaders(request)
    );
  }
  const body = await readBoundedJsonBody(request, 1024);
  if (body.tooLarge)
    return payloadTooLargeResponse(observationHeaders(request));
  const submitterId = parseSubmitterId(
    (body.value as { submitterId?: unknown } | null)?.submitterId
  );
  if (!submitterId) {
    return observationResponse(request, 400, {
      ok: false,
      code: 'INVALID_SUBMITTER',
      error: 'Provide submitterId as a uuid.',
    });
  }
  try {
    const { error } = await callObservationRpc('delete_extension_submitter', {
      p_submitter_id: submitterId,
    });
    if (error) return rpcFailureResponse(request, error);
    return observationResponse(request, 200, { ok: true });
  } catch (err) {
    log.error('delete_extension_submitter failed', {
      error: serializeError(err),
    });
    return rpcFailureResponse(request, {});
  }
}
