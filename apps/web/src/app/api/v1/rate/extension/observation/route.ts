import { parseExtensionObservationV1 } from '@repo/shared-data/rules';
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

const log = createLogger('api.extension.observation');

// Best-effort per-instance brake; the RPC holds the per-submitter and
// per-network limits.
const observationLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
  maxBuckets: 2_000,
});

export function OPTIONS(request: Request) {
  return observationOptions(request);
}

/**
 * POST /api/v1/rate/extension/observation { submitterId, observation }
 * (DOS/Rate#1606). The observation must be an ExtensionObservation v1; it is
 * stored in the quarantine, never as a public price. The raw IP is not sent
 * on: only a salted hash of its network range goes to the RPC.
 */
export async function POST(request: Request) {
  if (!isExtensionObservationsEnabled()) return notEnabledResponse(request);
  if (isWebPageOrigin(request)) return webPageRefusedResponse(request);
  if (!isJsonRequest(request)) return notJsonResponse(request);
  const key = ingestKey();
  if (!key || !hasNetworkHashSalt()) return unavailableResponse(request);
  const clientIp = extractClientRateLimitKey(request.headers);
  if (!observationLimiter.allow(clientIp)) {
    return rateLimitExceededResponse(
      'Too many observations; try again in a minute.',
      observationHeaders(request)
    );
  }
  const body = await readBoundedJsonBody(request, 8 * 1024);
  if (body.tooLarge)
    return payloadTooLargeResponse(observationHeaders(request));
  const raw =
    body.value && typeof body.value === 'object' && !Array.isArray(body.value)
      ? (body.value as { submitterId?: unknown; observation?: unknown })
      : {};
  const submitterId = parseSubmitterId(raw.submitterId);
  if (!submitterId) {
    return observationResponse(request, 400, {
      ok: false,
      code: 'INVALID_SUBMITTER',
      error: 'Provide submitterId as a uuid.',
    });
  }
  const parsed = parseExtensionObservationV1(raw.observation);
  if (!parsed.ok) {
    return observationResponse(request, 400, {
      ok: false,
      code: 'INVALID_OBSERVATION',
      error: 'The observation was refused.',
      field: parsed.field,
    });
  }
  try {
    const { data, error } = await callObservationRpc(
      'submit_extension_observation',
      {
        p_ingest_key: key,
        p_submitter_id: submitterId,
        p_observation: parsed.value,
        p_network_hash: networkHashFor(clientIp),
      }
    );
    if (error) return rpcFailureResponse(request, error);
    const stored =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as { status?: unknown })
        : null;
    return observationResponse(request, 200, {
      ok: true,
      status: stored?.status === 'quarantined' ? 'quarantined' : 'received',
    });
  } catch (err) {
    log.error('submit_extension_observation failed', {
      error: serializeError(err),
    });
    return rpcFailureResponse(request, {});
  }
}
