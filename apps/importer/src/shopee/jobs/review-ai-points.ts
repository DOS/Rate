/**
 * Review AI points job (DOS/Rate#1531, Docs/Proposals/2026-11-03-ai-review-points.html)
 *
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/review-ai-points.ts
 *     [--apply] [--purge <all|prompt version>] [--max <n>] [--wait-minutes <n>]
 *
 * Reads crawled user reviews, picks those that qualify (design section 1, D3),
 * sends them through the dos.ai gateway's Batch API (OpenAI format, D2 as JOY
 * decided on 2026-11-04) with a structured output schema per category
 * (section 2), checks every line it gets back (section 7.2) and
 * stores what passes as rate.review_points method 'ai' through
 * rate.store_review_ai_points, which writes the lines and the process-once
 * marker (rate.review_ai_extractions) in one transaction.
 *
 * Dry run by default: it reads, plans and logs counts and the cost ceiling,
 * and never calls a model (no key needed). `--apply` sends one batch with the
 * key in DOS_AI_API_KEY (DOS_AI_BASE_URL overrides the gateway URL), waits for
 * it (at most --wait-minutes, default 60) and stores the results.
 * It signs in as the rate_worker user (RATE_WORKER_EMAIL and
 * RATE_WORKER_PASSWORD with the publishable key), which reads the review
 * tables, writes the batch record and writes lines only through the writer.
 *
 * Switches and limits (section 8, D5):
 *   - REVIEW_AI_POINTS_ENABLED must be 'true', or the job exits before any
 *     model call; with --apply it also cancels a batch still running.
 *   - REVIEW_AI_MODEL: dos (default, Qwen3.8 27B on DOS's GPUs) or
 *     qwen3.8-max, the models the gateway's Batch API serves (D1's shape).
 *   - At most 2000 reviews a run (--max lowers it).
 *   - A monthly cap per model ($5 dos, $15 qwen3.8-max). The month's spend is the
 *     reported cost of its batches, or their reserved ceiling while running,
 *     read from rate.review_ai_batches. A batch whose ceiling would pass the
 *     cap is not sent, and the CLI exits with code 3.
 *   - `--purge all` or `--purge <version>` removes 'ai' lines and markers
 *     (dry run: it only says so). The next product-points run aggregates
 *     without them.
 *   - product-points has its own switch to hide 'ai' lines without a purge.
 *
 * Process once (section 4): a review is due when it has no marker, when its
 * text hash, the prompt version, the criteria version or its category differ
 * from its marker's, or when its marker says failed with fewer than 3
 * attempts. A batch's id and manifest are written to rate.review_ai_batches
 * right after it is created, so a run that dies collects it the next time
 * instead of sending the reviews again.
 *
 * Quality stops (section 7.2): a batch whose lines fail the evidence check
 * more than 10% of the time, or whose share of reviews with lines moves more
 * than 30 points from the last stored batch, is not stored and the run fails.
 * The batch stays 'ended': after a look, service_role marks it 'canceled' to
 * drop it, or a fixed job stores it on the next run.
 *
 * Logs hold counts only: never review text, quotes or lines. Run it from one
 * place at a time (the Rate-Services schedule), after the crawl and before
 * product-points and review-values.
 */
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { reviewDepth } from '@repo/shared-data/rules';
import { resolveBackfillSupabaseTarget } from '../paging.js';
import { createImporterLogger } from '../logger.js';
import { scopeSupabaseToRate, type RateSupabaseClient } from '../types.js';
import { reviewPointWeight, type CategoryRow, type PointMasterRow } from './product-points.js';
import { fetchByKey } from './review-values.js';
import {
  aiCategoryOpen,
  batchCostUsd,
  checkReviewPoints,
  DEFAULT_REVIEW_AI_MODEL,
  isReviewAiModel,
  RATING_CRITERIA_VERSION,
  REQUEST_MAX_TOKENS,
  reserveUsd,
  REVIEW_AI_MODELS,
  REVIEW_AI_PROMPT_VERSION,
  reviewAiInstructions,
  reviewAiOutputSchema,
  reviewAiUserMessage,
  REVIEWS_PER_REQUEST,
  reviewTextHash,
  textQualifies,
  type AiPoint,
  type AiRejectReason,
  type ReviewAiModel,
} from '../review-ai-prompt.js';

const logger = createImporterLogger('ReviewAiPointsJob');

/** Reviews a run sends at most (D5). */
export const MAX_REVIEWS_PER_RUN = 2000;
/** Attempts a failed result gets in all (the writer refuses a fourth). */
export const MAX_ATTEMPTS = 3;
/** Rows per writer call; the writer takes 500. */
export const STORE_ROWS = 200;
/** Stop when more than this share of lines fail the evidence check. */
export const EVIDENCE_STOP_SHARE = 0.1;
/** ...counted once a batch returns at least this many lines. */
export const EVIDENCE_STOP_MIN_LINES = 20;
/** Stop when the share of reviews with lines moves more than this from the last batch. */
export const SHARE_JUMP_STOP = 0.3;
/** ...when both batches have at least this many reviews. */
export const SHARE_JUMP_MIN_REVIEWS = 50;
const DEADLOCK_ATTEMPTS = 4;
/** A batch whose results cannot be read after 28 days is treated as gone. */
const RESULTS_KEPT_MS = 28 * 24 * 60 * 60 * 1000;
const PROMPT_VERSION_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

// --- The model client: the Batch API as the job uses it, so tests pass a fake. ------------

/** One line of a dos.ai (OpenAI-format) batch input file. */
export interface BatchRequest {
  custom_id: string;
  method: 'POST';
  url: '/v1/chat/completions';
  body: {
    model: ReviewAiModel;
    max_tokens: number;
    temperature: number;
    stream: false;
    messages: [{ role: 'system'; content: string }, { role: 'user'; content: string }];
    response_format: {
      type: 'json_schema';
      json_schema: { name: string; strict: true; schema: Record<string, unknown> };
    };
  };
}

export interface BatchUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export type BatchResult =
  | {
      custom_id: string;
      result: {
        type: 'succeeded';
        message: {
          stop_reason: string | null;
          content: { type: string; text?: string }[];
          usage: BatchUsage;
        };
      };
    }
  | { custom_id: string; result: { type: 'errored' | 'expired' | 'canceled' | 'unbilled' } };

export interface ReviewAiClient {
  createBatch(requests: BatchRequest[]): Promise<{ id: string }>;
  batchStatus(id: string): Promise<'in_progress' | 'canceling' | 'ended'>;
  results(id: string): AsyncIterable<BatchResult>;
  cancelBatch(id: string): Promise<void>;
}

/** The dos.ai gateway's default base URL, as the importer's other AI clients use it. */
export const DOS_AI_DEFAULT_BASE_URL = 'https://api.dos.me/v1';
const DOS_AI_TIMEOUT_MS = 60_000;
const DOS_AI_ATTEMPTS = 3;

/** One line of a dos.ai batch output file (OpenAI batch format). */
interface DosAiOutputLine {
  custom_id?: string;
  response?: {
    status_code?: number;
    body?: {
      choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } | null;
      };
    };
  } | null;
  error?: { code?: string; message?: string } | null;
}

/**
 * A dos.ai output line as the job reads results: a 200 response is a
 * message whose stop reason is the finish reason ('stop' ends normally,
 * 'length' is cut off, 'content_filter' is refused); a line the gateway did
 * not run for want of credits (402, insufficient_credits) is 'unbilled', so
 * the review stays due without spending an attempt; anything else errored.
 * Cached prompt tokens are split out of prompt_tokens.
 */
export function fromDosAiOutputLine(line: DosAiOutputLine): BatchResult | null {
  if (typeof line.custom_id !== 'string') return null;
  const body = line.response?.body;
  if (
    line.response?.status_code === 402 ||
    /insufficient|credit|balance/i.test(line.error?.code ?? '')
  ) {
    return { custom_id: line.custom_id, result: { type: 'unbilled' } };
  }
  if (line.error || line.response?.status_code !== 200 || !body) {
    return { custom_id: line.custom_id, result: { type: 'errored' } };
  }
  const choice = body.choices?.[0];
  const finish = choice?.finish_reason ?? null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const cachedRead = n(body.usage?.prompt_tokens_details?.cached_tokens);
  const cachedWrite = n(body.usage?.prompt_tokens_details?.cache_write_tokens);
  return {
    custom_id: line.custom_id,
    result: {
      type: 'succeeded',
      message: {
        stop_reason:
          finish === 'stop'
            ? 'end_turn'
            : finish === 'length'
              ? 'max_tokens'
              : finish === 'content_filter'
                ? 'refusal'
                : finish,
        content: [{ type: 'text', text: choice?.message?.content ?? '' }],
        usage: {
          input_tokens: Math.max(0, n(body.usage?.prompt_tokens) - cachedRead - cachedWrite),
          output_tokens: n(body.usage?.completion_tokens),
          cache_read_input_tokens: cachedRead,
          cache_creation_input_tokens: cachedWrite,
        },
      },
    },
  };
}

/**
 * A batch whose results will never come: the gateway failed it as a whole
 * (a refused file, a Zero Data Retention organization, no credits at start),
 * it ended with no output, or its output file is gone. The job closes its row
 * and stores nothing, so its reviews are due again without spending an attempt.
 */
export class BatchGoneError extends Error {
  constructor(
    message: string,
    readonly status: 'canceled' | 'expired'
  ) {
    super(message);
    this.name = 'BatchGoneError';
  }
}

/**
 * The real client: the dos.ai gateway's OpenAI-compatible Files and Batch API
 * (POST /files, POST /batches, GET /batches/:id, POST /batches/:id/cancel,
 * GET /files/:id/content), with the key in DOS_AI_API_KEY as a Bearer token.
 * Each call, body included, has a timeout. A 429 or 5xx, or a network error,
 * is retried, except on POST /batches: a batch may have been created behind a
 * lost answer, and a retry would run and bill a second one, so that call is
 * retried only on 429 (refused before anything was created). A 402 (no
 * credits left) stops the run.
 */
export function dosAiReviewAiClient(
  apiKey: string,
  baseUrl: string = DOS_AI_DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
  wait: (ms: number) => Promise<unknown> = ms => new Promise(r => setTimeout(r, ms))
): ReviewAiClient {
  const base = baseUrl.replace(/\/+$/, '');
  const call = async (
    path: string,
    init: RequestInit = {},
    retry: 'all' | 'throttled' = 'all'
  ): Promise<{ status: number; text: string }> => {
    for (let attempt = 1; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DOS_AI_TIMEOUT_MS);
      let status = 0;
      let text = '';
      let failure: unknown = null;
      try {
        const response = await fetchImpl(`${base}${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
          signal: controller.signal,
        });
        status = response.status;
        text = await response.text();
      } catch (err) {
        failure = err;
      } finally {
        clearTimeout(timer);
      }
      if (failure === null && status >= 200 && status < 300) return { status, text };
      if (status === 402) {
        throw new Error('dos.ai refused the request: no credits left on the key (402).');
      }
      const retryable =
        retry === 'all' ? failure !== null || status === 429 || status >= 500 : status === 429;
      if (!retryable || attempt >= DOS_AI_ATTEMPTS) {
        if (failure !== null && retry === 'throttled') {
          throw new Error(
            `dos.ai ${init.method ?? 'GET'} ${path}: no answer (${String(failure)}). A batch may have been created; check the key's batches on dos.ai before the next run.`
          );
        }
        if (failure !== null) throw failure;
        // The body names the reason; it holds no review text of ours.
        throw new Error(`dos.ai ${init.method ?? 'GET'} ${path}: ${status} ${text.slice(0, 300)}`);
      }
      await wait(1000 * 2 ** (attempt - 1));
    }
  };
  const json = async <T>(path: string, init?: RequestInit, retry?: 'all' | 'throttled') =>
    JSON.parse((await call(path, init, retry)).text) as T;
  return {
    async createBatch(requests) {
      const form = new FormData();
      form.append('purpose', 'batch');
      form.append(
        'file',
        new Blob([requests.map(r => JSON.stringify(r)).join('\n') + '\n'], {
          type: 'application/jsonl',
        }),
        'review-ai-points.jsonl'
      );
      const file = await json<{ id: string }>('/files', { method: 'POST', body: form });
      const batch = await json<{ id: string }>(
        '/batches',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_file_id: file.id,
            endpoint: '/v1/chat/completions',
            completion_window: '24h',
          }),
        },
        'throttled'
      );
      return { id: batch.id };
    },
    async batchStatus(id) {
      const batch = await json<{ status: string }>(`/batches/${encodeURIComponent(id)}`);
      if (batch.status === 'cancelling') return 'canceling';
      return ['completed', 'failed', 'cancelled', 'expired'].includes(batch.status)
        ? 'ended'
        : 'in_progress';
    },
    async *results(id) {
      const batch = await json<{
        status?: string;
        output_file_id?: string | null;
        errmsg?: string | null;
      }>(`/batches/${encodeURIComponent(id)}`);
      if (!batch.output_file_id) {
        // Failed as a whole, or ended with no line run: nothing to store.
        throw new BatchGoneError(
          `dos.ai batch ${id} ended ${batch.status ?? 'without a status'} with no output${batch.errmsg ? `: ${batch.errmsg.slice(0, 200)}` : ''}`,
          batch.status === 'expired' ? 'expired' : 'canceled'
        );
      }
      let text: string;
      try {
        text = (await call(`/files/${encodeURIComponent(batch.output_file_id)}/content`)).text;
      } catch (err) {
        if (/ 404 /.test(String(err))) {
          throw new BatchGoneError(`dos.ai batch ${id}: its output file is gone (404)`, 'expired');
        }
        throw err;
      }
      for (const raw of text.split('\n')) {
        if (!raw.trim()) continue;
        let line: DosAiOutputLine;
        try {
          line = JSON.parse(raw) as DosAiOutputLine;
        } catch {
          continue;
        }
        const result = fromDosAiOutputLine(line);
        if (result) yield result;
      }
    },
    async cancelBatch(id) {
      await call(`/batches/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    },
  };
}

// --- Rows the job reads. ------------------------------------------------------------------

type FlagRow = {
  include_in_rating: boolean | null;
  verdict: string | null;
  flag_category: string | null;
};

export interface AiReviewRow {
  id: string;
  product_id: string;
  origin: string | null;
  reviewer_type: string | null;
  helpfulness_weight: number | string | null;
  comment: string | null;
  review_flags: FlagRow | FlagRow[] | null;
}

export interface AiListingRow {
  id: string;
  cluster_id: string | null;
  origin: string | null;
}

export interface AiMarkerRow {
  review_id: string;
  text_hash: string;
  prompt_version: string;
  criteria_version: number;
  category_slug: string;
  outcome: string;
  attempts: number;
  batch_id: string | null;
}

export interface ManifestReview {
  ref: number;
  id: string;
  text_hash: string;
}

export interface ManifestRequest {
  custom_id: string;
  category: string;
  criteria_version: number;
  reviews: ManifestReview[];
}

export interface AiBatchRow {
  id: string;
  model: string;
  prompt_version: string;
  status: string;
  manifest: ManifestRequest[];
  reserved_usd: number | string;
  cost_usd: number | string | null;
  submitted_at: string;
  stored_at: string | null;
}

/** One row of rate.store_review_ai_points. */
export interface AiStoreRow {
  id: string;
  text_hash: string;
  prompt_version: string;
  criteria_version: number;
  category: string;
  model: string;
  batch_id: string | null;
  failed: boolean;
  rejected: number;
  points: AiPoint[];
}

export type StoreCounts = Record<
  | 'stored'
  | 'empty'
  | 'rejected'
  | 'failed'
  | 'missing'
  | 'not_crawl'
  | 'writer'
  | 'stale'
  | 'unquoted'
  | 'done'
  | 'exhausted',
  number
>;

const emptyCounts = (): StoreCounts => ({
  stored: 0,
  empty: 0,
  rejected: 0,
  failed: 0,
  missing: 0,
  not_crawl: 0,
  writer: 0,
  stale: 0,
  unquoted: 0,
  done: 0,
  exhausted: 0,
});

const flagOf = (review: AiReviewRow): FlagRow | null =>
  Array.isArray(review.review_flags) ? (review.review_flags[0] ?? null) : review.review_flags;

// --- Which reviews are due (sections 1 and 4). --------------------------------------------

export interface AiCandidate {
  id: string;
  text: string;
  textHash: string;
  category: string;
}

/**
 * The reviews to send, in review id order: crawled user reviews past the
 * gate (a flag that does not exclude them, a weight above 0, not filler), long
 * enough and in Vietnamese or English, on a crawled listing of a master in an
 * open category, with no writer line, not waiting in an open batch, and due
 * by their marker.
 */
export function aiCandidates(input: {
  reviews: readonly AiReviewRow[];
  writerReviewIds: ReadonlySet<string>;
  markers: readonly AiMarkerRow[];
  listings: readonly AiListingRow[];
  masters: readonly PointMasterRow[];
  categories: readonly CategoryRow[];
  pending: ReadonlySet<string>;
  promptVersion?: string;
}): AiCandidate[] {
  const promptVersion = input.promptVersion ?? REVIEW_AI_PROMPT_VERSION;
  const slugByCategory = new Map(input.categories.map(c => [c.id, c.slug]));
  const slugByMaster = new Map(
    input.masters.map(m => [
      m.id,
      m.category_id ? (slugByCategory.get(m.category_id) ?? null) : null,
    ])
  );
  const slugByListing = new Map(
    input.listings
      .filter(l => l.origin === 'crawl' && l.cluster_id)
      .map(l => [l.id, slugByMaster.get(l.cluster_id as string) ?? null])
  );
  const markerById = new Map(input.markers.map(m => [m.review_id, m]));
  const out: AiCandidate[] = [];
  for (const review of input.reviews) {
    if (review.origin !== 'crawl' || review.reviewer_type !== 'user') continue;
    if (input.writerReviewIds.has(review.id) || input.pending.has(review.id)) continue;
    const category = slugByListing.get(review.product_id) ?? null;
    if (!aiCategoryOpen(category)) continue;
    const flag = flagOf(review);
    const weight = reviewPointWeight({
      id: review.id,
      product_id: review.product_id,
      origin: review.origin,
      reviewer_type: review.reviewer_type,
      helpfulness_weight: review.helpfulness_weight,
      created_at: null,
      platform_created_at: null,
      review_flags: flag,
    });
    if (weight === 0) continue;
    const text = (review.comment ?? '').normalize('NFC');
    const depth = reviewDepth({
      comment: text,
      verdict: null,
      points: [],
      reviewerType: review.reviewer_type,
      flagCategory: flag?.flag_category ?? null,
    });
    if (depth === 'filler' || !textQualifies(text)) continue;
    const textHash = reviewTextHash(text);
    const marker = markerById.get(review.id);
    const sameKey =
      marker !== undefined &&
      marker.text_hash === textHash &&
      marker.prompt_version === promptVersion &&
      Number(marker.criteria_version) === RATING_CRITERIA_VERSION &&
      marker.category_slug === category;
    if (sameKey && !(marker.outcome === 'failed' && Number(marker.attempts) < MAX_ATTEMPTS)) {
      continue;
    }
    out.push({ id: review.id, text, textHash, category });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Requests of up to REVIEWS_PER_REQUEST reviews of one category, with their manifest. */
export function buildRequests(
  candidates: readonly AiCandidate[],
  model: ReviewAiModel
): { requests: BatchRequest[]; manifest: ManifestRequest[]; instructions: string[] } {
  const byCategory = new Map<string, AiCandidate[]>();
  for (const c of candidates) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  const requests: BatchRequest[] = [];
  const manifest: ManifestRequest[] = [];
  const instructions: string[] = [];
  for (const [category, list] of [...byCategory].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const system = reviewAiInstructions(category);
    const schema = reviewAiOutputSchema(category);
    for (let i = 0; i < list.length; i += REVIEWS_PER_REQUEST) {
      const part = list.slice(i, i + REVIEWS_PER_REQUEST);
      const custom_id = `${category}-${requests.length}`;
      const refs = part.map((c, j) => ({ ref: j + 1, candidate: c }));
      requests.push({
        custom_id,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model,
          max_tokens: REQUEST_MAX_TOKENS,
          temperature: 0,
          stream: false,
          // The instructions first and the same for a category: a shared prefix the
          // gateway's backends can cache on their own.
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content: reviewAiUserMessage(refs.map(r => ({ ref: r.ref, text: r.candidate.text }))),
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'review_points', strict: true, schema },
          },
        },
      });
      instructions.push(system);
      manifest.push({
        custom_id,
        category,
        criteria_version: RATING_CRITERIA_VERSION,
        reviews: refs.map(r => ({
          ref: r.ref,
          id: r.candidate.id,
          text_hash: r.candidate.textHash,
        })),
      });
    }
  }
  return { requests, manifest, instructions };
}

// --- Reading a batch's results (section 7.2). ---------------------------------------------

export interface CollectedBatch {
  rows: AiStoreRow[];
  usage: Required<{ [K in keyof BatchUsage]: number }>;
  costUsd: number;
  lines: number;
  rejects: Record<AiRejectReason, number>;
  unaccented: number;
  failedReviews: number;
  /** Reviews in requests the gateway did not run for want of credits: still due. */
  unbilledReviews: number;
  reviewsWithLines: number;
  reviewsAnswered: number;
}

/** The text the model returned, parsed, or null. */
function parseOutput(message: { content: { type: string; text?: string }[] }): unknown {
  const text = message.content
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('');
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The writer's rows for every review of a batch. A request that did not end
 * normally (cut off at max_tokens, refused, errored, expired, canceled, or
 * not JSON), or a review the model left out, gives failed rows: never an
 * empty result.
 */
export function collectBatch(
  batch: Pick<AiBatchRow, 'id' | 'model' | 'prompt_version' | 'manifest'>,
  results: readonly BatchResult[],
  textById: ReadonlyMap<string, string>
): CollectedBatch {
  const model = batch.model as ReviewAiModel;
  const byId = new Map(results.map(r => [r.custom_id, r]));
  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  const out: CollectedBatch = {
    rows: [],
    usage,
    costUsd: 0,
    lines: 0,
    rejects: {
      shape: 0,
      evidence: 0,
      length: 0,
      criterion: 0,
      evasive: 0,
      duplicate: 0,
      too_many: 0,
    },
    unaccented: 0,
    failedReviews: 0,
    unbilledReviews: 0,
    reviewsWithLines: 0,
    reviewsAnswered: 0,
  };
  for (const request of batch.manifest) {
    const result = byId.get(request.custom_id);
    let entries: Map<number, unknown> | null = null;
    if (result?.result.type === 'succeeded') {
      const message = result.result.message;
      for (const key of Object.keys(usage) as (keyof typeof usage)[]) {
        const n = Number(message.usage?.[key] ?? 0);
        usage[key] += Number.isFinite(n) && n > 0 ? n : 0;
      }
      if (message.stop_reason === 'end_turn') {
        const parsed = parseOutput(message) as { reviews?: unknown } | null;
        if (parsed && Array.isArray(parsed.reviews)) {
          entries = new Map();
          for (const entry of parsed.reviews as { ref?: unknown; points?: unknown }[]) {
            if (entry && Number.isInteger(entry.ref) && !entries.has(entry.ref as number)) {
              entries.set(entry.ref as number, entry.points);
            }
          }
        }
      }
    }
    // A request the gateway never ran for want of credits: its reviews stay due, no attempt spent.
    if (result?.result.type === 'unbilled') {
      out.unbilledReviews += request.reviews.length;
      continue;
    }
    for (const review of request.reviews) {
      const base = {
        id: review.id,
        text_hash: review.text_hash,
        prompt_version: batch.prompt_version,
        criteria_version: request.criteria_version,
        category: request.category,
        model: batch.model,
        batch_id: batch.id,
      };
      const raw = entries?.get(review.ref);
      if (entries === null || !Array.isArray(raw)) {
        out.failedReviews += 1;
        out.rows.push({ ...base, failed: true, rejected: 0, points: [] });
        continue;
      }
      const checked = checkReviewPoints(textById.get(review.id) ?? '', request.category, raw);
      const rejected = Object.values(checked.rejected).reduce((s, n) => s + n, 0);
      for (const [reason, n] of Object.entries(checked.rejected) as [AiRejectReason, number][]) {
        out.rejects[reason] += n;
      }
      out.lines += checked.points.length + rejected;
      out.unaccented += checked.points.filter(p => p.match === 'unaccented').length;
      out.reviewsAnswered += 1;
      if (checked.points.length > 0) out.reviewsWithLines += 1;
      out.rows.push({
        ...base,
        failed: false,
        rejected: Math.min(rejected, 20),
        points: checked.points,
      });
    }
  }
  out.costUsd = isReviewAiModel(model) ? batchCostUsd(model, usage) : 0;
  return out;
}

/** Why a collected batch must not be stored, or null (section 7.2). */
export function qualityStop(
  collected: CollectedBatch,
  previousShare: { share: number; reviews: number } | null
): string | null {
  if (
    collected.lines >= EVIDENCE_STOP_MIN_LINES &&
    collected.rejects.evidence / collected.lines > EVIDENCE_STOP_SHARE
  ) {
    return `${collected.rejects.evidence} of ${collected.lines} lines failed the evidence check`;
  }
  if (
    previousShare !== null &&
    previousShare.reviews >= SHARE_JUMP_MIN_REVIEWS &&
    collected.reviewsAnswered >= SHARE_JUMP_MIN_REVIEWS
  ) {
    const share = collected.reviewsWithLines / collected.reviewsAnswered;
    if (Math.abs(share - previousShare.share) > SHARE_JUMP_STOP) {
      return `the share of reviews with lines moved from ${previousShare.share.toFixed(2)} to ${share.toFixed(2)}`;
    }
  }
  return null;
}

// --- Database calls. ----------------------------------------------------------------------

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Stores rows in calls of STORE_ROWS, retrying a deadlock; returns the summed counts. */
export async function storeAiRows(
  supabase: RateSupabaseClient,
  rows: readonly AiStoreRow[],
  wait: (ms: number) => Promise<unknown> = sleep
): Promise<StoreCounts> {
  const total = emptyCounts();
  for (let i = 0; i < rows.length; i += STORE_ROWS) {
    const part = rows.slice(i, i + STORE_ROWS);
    for (let attempt = 1; ; attempt++) {
      const { data, error } = await supabase.rpc('store_review_ai_points', { p_rows: part });
      if (!error) {
        for (const [key, n] of Object.entries((data ?? {}) as Record<string, unknown>)) {
          if (key in total) total[key as keyof StoreCounts] += Number(n) || 0;
        }
        break;
      }
      if (error.code === '40P01' && attempt < DEADLOCK_ATTEMPTS) {
        await wait(250 * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(`store_review_ai_points (${error.code ?? 'no code'}): ${error.message}`);
    }
  }
  return total;
}

const monthStart = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

/** This month's spend of a model: reported cost, or the reserved ceiling while open. */
export function monthSpendUsd(batches: readonly AiBatchRow[], model: string, now: Date): number {
  const start = monthStart(now);
  return batches
    .filter(b => b.model === model && b.submitted_at >= start)
    .reduce((s, b) => s + Number(b.cost_usd ?? b.reserved_usd ?? 0), 0);
}

const BATCH_COLUMNS =
  'id, model, prompt_version, status, manifest, reserved_usd, cost_usd, submitted_at, stored_at';

export interface ReviewAiPointsResult {
  apply: boolean;
  enabled: boolean;
  model: ReviewAiModel;
  candidates: number;
  sent: number;
  requests: number;
  reservedUsd: number;
  monthSpendUsd: number;
  capped: boolean;
  collected: string[];
  stored: StoreCounts;
  canceled: string[];
  waiting: string[];
  purged: { lines: number; markers: number } | null;
}

export interface ReviewAiPointsOptions {
  apply?: boolean;
  /** REVIEW_AI_POINTS_ENABLED === 'true'. */
  enabled?: boolean;
  model?: ReviewAiModel;
  purge?: string | null;
  maxReviews?: number;
  /** Needed only to send, collect or cancel (never in a dry run). */
  ai?: ReviewAiClient | null;
  now?: Date;
  waitMs?: number;
  pollMs?: number;
  wait?: (ms: number) => Promise<unknown>;
  promptVersion?: string;
}

export async function runReviewAiPointsJob(
  supabase: RateSupabaseClient,
  options: ReviewAiPointsOptions = {}
): Promise<ReviewAiPointsResult> {
  const apply = options.apply === true;
  const enabled = options.enabled === true;
  const model = options.model ?? DEFAULT_REVIEW_AI_MODEL;
  if (!isReviewAiModel(model)) throw new Error(`Unknown model '${String(model)}'.`);
  const promptVersion = options.promptVersion ?? REVIEW_AI_PROMPT_VERSION;
  const maxReviews = Math.min(options.maxReviews ?? MAX_REVIEWS_PER_RUN, MAX_REVIEWS_PER_RUN);
  if (!Number.isInteger(maxReviews) || maxReviews < 1) throw new Error('--max must be 1 to 2000.');
  const now = options.now ?? new Date();
  const wait = options.wait ?? sleep;
  const waitMs = options.waitMs ?? 60 * 60 * 1000;
  if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 24 * 60 * 60 * 1000) {
    throw new Error('--wait-minutes must be 0 to 1440.');
  }
  const pollMs = options.pollMs ?? 60 * 1000;
  const result: ReviewAiPointsResult = {
    apply,
    enabled,
    model,
    candidates: 0,
    sent: 0,
    requests: 0,
    reservedUsd: 0,
    monthSpendUsd: 0,
    capped: false,
    collected: [],
    stored: emptyCounts(),
    canceled: [],
    waiting: [],
    purged: null,
  };
  const needAi = (): ReviewAiClient => {
    if (!options.ai) throw new Error('DOS_AI_API_KEY is needed to send or collect a batch.');
    return options.ai;
  };

  // The purge: one call, nothing else.
  if (options.purge !== undefined && options.purge !== null) {
    const version = options.purge;
    if (version !== 'all' && !PROMPT_VERSION_RE.test(version)) {
      throw new Error("--purge takes 'all' or a prompt version.");
    }
    if (!apply) {
      logger.info('review_ai.purge', `Dry run: would purge ai lines of ${version}.`, { version });
      return result;
    }
    const { data, error } = await supabase.rpc('purge_review_ai_points', {
      p_prompt_version: version,
    });
    if (error) throw new Error(`purge_review_ai_points: ${error.message}`);
    result.purged = data as { lines: number; markers: number };
    logger.info('review_ai.purge', `Purged ai lines of ${version}.`, { version, ...result.purged });
    return result;
  }

  const batches = await fetchByKey<AiBatchRow>(supabase, 'review_ai_batches', BATCH_COLUMNS, 'id');
  const open = batches.filter(b => b.status === 'submitted' || b.status === 'ended');

  // The kill switch: no model call; --apply cancels what is still running at the API. The
  // row stays open: requests that finished before the cancel are paid for, so the next
  // enabled run collects them (the canceled ones come back as failed rows, to retry).
  if (!enabled) {
    if (apply) {
      for (const batch of open.filter(b => b.status === 'submitted')) {
        if ((await needAi().batchStatus(batch.id)) !== 'in_progress') continue;
        await needAi().cancelBatch(batch.id);
        result.canceled.push(batch.id);
      }
    }
    logger.info(
      'review_ai.disabled',
      `REVIEW_AI_POINTS_ENABLED is not 'true': no model call${result.canceled.length ? `, ${result.canceled.length} batches canceled` : ''}.`,
      { canceled: result.canceled.length }
    );
    return result;
  }

  // Collect what an earlier run left open, then what this run sends.
  const collectOpen = async (batch: AiBatchRow): Promise<boolean> => {
    const ai = needAi();
    const deadline = Date.now() + waitMs;
    for (;;) {
      const status = await ai.batchStatus(batch.id);
      if (status === 'ended') break;
      if (Date.now() >= deadline) {
        result.waiting.push(batch.id);
        logger.info('review_ai.waiting', `Batch ${batch.id} still running; collected next run.`, {
          batch: batch.id,
        });
        return false;
      }
      await wait(pollMs);
    }
    const results: BatchResult[] = [];
    try {
      for await (const entry of ai.results(batch.id)) results.push(entry);
    } catch (err) {
      // Results that will never come (the client says so, or the batch is past 28 days):
      // close the row and store nothing, so the reviews are due again with no attempt spent.
      const gone = err instanceof BatchGoneError;
      if (!gone && now.getTime() - new Date(batch.submitted_at).getTime() < RESULTS_KEPT_MS) {
        throw err;
      }
      const status = gone ? err.status : 'expired';
      const { error } = await supabase
        .from('review_ai_batches')
        .update({ status, ended_at: now.toISOString() })
        .eq('id', batch.id);
      if (error) throw new Error(`review_ai_batches close: ${error.message}`);
      logger.warn(
        'review_ai.gone',
        `Batch ${batch.id} has no results to store; marked ${status}.`,
        {
          batch: batch.id,
          reason: err instanceof Error ? err.message : String(err),
        }
      );
      return false;
    }
    const ids = batch.manifest.flatMap(r => r.reviews.map(v => v.id));
    const texts = await selectReviewsIn(supabase, ids);
    const collected = collectBatch(
      batch,
      results,
      new Map(texts.map(r => [r.id, (r.comment ?? '').normalize('NFC')]))
    );
    const { error: endError } = await supabase
      .from('review_ai_batches')
      .update({
        status: 'ended',
        ended_at: now.toISOString(),
        input_tokens: collected.usage.input_tokens,
        output_tokens: collected.usage.output_tokens,
        cache_read_tokens: collected.usage.cache_read_input_tokens,
        cache_write_tokens: collected.usage.cache_creation_input_tokens,
        cost_usd: Number(collected.costUsd.toFixed(4)),
      })
      .eq('id', batch.id);
    if (endError) throw new Error(`review_ai_batches end: ${endError.message}`);
    const latest = await fetchByKey<AiBatchRow>(supabase, 'review_ai_batches', BATCH_COLUMNS, 'id');
    const stop = qualityStop(collected, await previousShare(supabase, latest, batch.id));
    if (stop !== null) {
      throw new Error(`Batch ${batch.id} not stored: ${stop}. Look at it before the next run.`);
    }
    // A run that died after storing part of this batch: its rows already have markers of
    // this batch. Storing them again would count a failed review's attempt twice.
    const done = new Set(
      (
        await fetchByKey<{ review_id: string }>(
          supabase,
          'review_ai_extractions',
          'review_id',
          'review_id',
          query => query.eq('batch_id', batch.id)
        )
      ).map(m => m.review_id)
    );
    const counts = await storeAiRows(
      supabase,
      collected.rows.filter(row => !done.has(row.id)),
      wait
    );
    for (const key of Object.keys(counts) as (keyof StoreCounts)[])
      result.stored[key] += counts[key];
    const { error: storeError } = await supabase
      .from('review_ai_batches')
      .update({ status: 'stored', stored_at: new Date().toISOString() })
      .eq('id', batch.id);
    if (storeError) throw new Error(`review_ai_batches store: ${storeError.message}`);
    result.collected.push(batch.id);
    logger.info('review_ai.stored', `Stored batch ${batch.id}.`, {
      batch: batch.id,
      reviews: collected.rows.length,
      lines: collected.lines,
      rejects: collected.rejects,
      unaccented: collected.unaccented,
      failed_reviews: collected.failedReviews,
      unbilled_reviews: collected.unbilledReviews,
      cost_usd: Number(collected.costUsd.toFixed(4)),
      ...counts,
    });
    return true;
  };

  if (apply) {
    for (const batch of open) await collectOpen(batch);
  }

  // Plan this run's batch.
  const reviews = await fetchByKey<AiReviewRow>(
    supabase,
    'reviews',
    'id, product_id, origin, reviewer_type, helpfulness_weight, comment, review_flags(include_in_rating, verdict, flag_category)',
    'id',
    query => query.eq('origin', 'crawl').eq('reviewer_type', 'user')
  );
  const writerLines = await fetchByKey<{ id: string; review_id: string }>(
    supabase,
    'review_points',
    'id, review_id',
    'id',
    query => query.eq('method', 'writer')
  );
  const markers = await fetchByKey<AiMarkerRow>(
    supabase,
    'review_ai_extractions',
    'review_id, text_hash, prompt_version, criteria_version, category_slug, outcome, attempts, batch_id',
    'review_id'
  );
  const listings = await fetchByKey<AiListingRow>(
    supabase,
    'products',
    'id, cluster_id, origin',
    'id',
    query => query.eq('origin', 'crawl')
  );
  const masters = await fetchByKey<PointMasterRow>(
    supabase,
    'master_products',
    'id, category_id',
    'id'
  );
  const categories = await fetchByKey<CategoryRow>(supabase, 'categories', 'id, slug', 'id');
  // Reviews in a batch still open are not due: after --apply, the ones still running; in a
  // dry run, which collects nothing, every open batch.
  const stillOpen = new Set(apply ? result.waiting : open.map(b => b.id));
  const pending = new Set(
    batches
      .filter(b => stillOpen.has(b.id))
      .flatMap(b => b.manifest.flatMap(r => r.reviews.map(v => v.id)))
  );
  const candidates = aiCandidates({
    reviews,
    writerReviewIds: new Set(writerLines.map(l => l.review_id)),
    markers,
    listings,
    masters,
    categories,
    pending,
    promptVersion,
  });
  result.candidates = candidates.length;
  const chosen = candidates.slice(0, maxReviews);
  const { requests, manifest, instructions } = buildRequests(chosen, model);
  result.requests = requests.length;
  result.reservedUsd = reserveUsd(
    model,
    requests.map((r, i) => ({
      instructions: instructions[i]!,
      message: r.body.messages[1].content,
    }))
  );
  const refreshed = await fetchByKey<AiBatchRow>(
    supabase,
    'review_ai_batches',
    BATCH_COLUMNS,
    'id'
  );
  result.monthSpendUsd = monthSpendUsd(refreshed, model, now);
  const cap = REVIEW_AI_MODELS[model].monthlyCapUsd;
  result.capped = requests.length > 0 && result.monthSpendUsd + result.reservedUsd > cap;
  logger.info(
    'review_ai.plan',
    `${apply ? 'Sending' : 'Would send'} ${chosen.length} of ${candidates.length} due reviews in ${requests.length} requests; ceiling $${result.reservedUsd.toFixed(4)}, month $${result.monthSpendUsd.toFixed(4)} of $${cap}.`,
    {
      apply,
      model,
      candidates: candidates.length,
      reviews: chosen.length,
      requests: requests.length,
      reserved_usd: result.reservedUsd,
      month_usd: result.monthSpendUsd,
      cap_usd: cap,
      capped: result.capped,
    }
  );
  if (result.capped) {
    logger.warn(
      'review_ai.cap',
      `The batch would pass the $${cap} monthly cap of ${model}; not sent.`,
      {
        model,
      }
    );
    return result;
  }
  if (!apply || requests.length === 0) return result;

  const created = await needAi().createBatch(requests);
  // The id first, so a run that dies from here on collects this batch instead of re-sending.
  const row = {
    id: created.id,
    model,
    prompt_version: promptVersion,
    status: 'submitted',
    request_count: requests.length,
    review_count: chosen.length,
    manifest,
    reserved_usd: result.reservedUsd,
    submitted_at: now.toISOString(),
  };
  const { error } = await supabase.from('review_ai_batches').insert(row);
  if (error) {
    // Unrecorded, its results would never be collected: stop it before more is spent.
    const canceled = await needAi()
      .cancelBatch(created.id)
      .then(
        () => 'canceled',
        () => 'NOT canceled; cancel it by hand'
      );
    throw new Error(
      `review_ai_batches insert for ${created.id}: ${error.message}. The batch was ${canceled}.`
    );
  }
  result.sent = chosen.length;
  await collectOpen({ ...row, cost_usd: null, stored_at: null });
  return result;
}

async function selectReviewsIn(
  supabase: RateSupabaseClient,
  ids: readonly string[]
): Promise<{ id: string; comment: string | null }[]> {
  const rows: { id: string; comment: string | null }[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 150) {
    const part = unique.slice(i, i + 150);
    rows.push(
      ...(await fetchByKey<{ id: string; comment: string | null }>(
        supabase,
        'reviews',
        'id, comment',
        'id',
        query => query.in('id', part)
      ))
    );
  }
  return rows;
}

/** The share of answered reviews with lines in the last stored batch, from its markers. */
async function previousShare(
  supabase: RateSupabaseClient,
  batches: readonly AiBatchRow[],
  current: string
): Promise<{ share: number; reviews: number } | null> {
  const last = batches
    .filter(b => b.status === 'stored' && b.id !== current && b.stored_at)
    .sort((a, b) => ((a.stored_at ?? '') < (b.stored_at ?? '') ? 1 : -1))[0];
  if (!last) return null;
  const markers = await fetchByKey<{ review_id: string; outcome: string }>(
    supabase,
    'review_ai_extractions',
    'review_id, outcome',
    'review_id',
    query => query.eq('batch_id', last.id)
  );
  const answered = markers.filter(m => m.outcome !== 'failed');
  if (answered.length === 0) return null;
  return {
    share: answered.filter(m => m.outcome === 'stored').length / answered.length,
    reviews: answered.length,
  };
}

// --- CLI. ---------------------------------------------------------------------------------

const argValue = (name: string): string | null => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? (process.argv[at + 1] ?? '') : null;
};

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectExecution) {
  dotenv.config({ quiet: true });
  dotenv.config({ path: '../../.env', quiet: true });
  (async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    // The publishable key plus the worker user's sign-in: its access token
    // carries the rate_worker role, which reads the review tables, writes the
    // batch record and writes lines only through rate.store_review_ai_points.
    const key = (
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
    ).trim();
    const email = (process.env.RATE_WORKER_EMAIL || '').trim();
    const password = process.env.RATE_WORKER_PASSWORD || '';
    if (!rawUrl.trim() || !key || !email || !password) {
      throw new Error(
        'Missing SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, RATE_WORKER_EMAIL or RATE_WORKER_PASSWORD in environment.'
      );
    }
    const modelName = (process.env.REVIEW_AI_MODEL || DEFAULT_REVIEW_AI_MODEL).trim();
    if (!isReviewAiModel(modelName)) {
      throw new Error(
        `REVIEW_AI_MODEL must be one of ${Object.keys(REVIEW_AI_MODELS).join(', ')}.`
      );
    }
    const apply = process.argv.includes('--apply');
    const enabled = (process.env.REVIEW_AI_POINTS_ENABLED || '').trim() === 'true';
    const max = argValue('--max');
    const waitMinutes = argValue('--wait-minutes');
    const { url, host } = resolveBackfillSupabaseTarget(rawUrl);
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (authError || !auth.session) {
      throw new Error(
        `Sign-in as the rate_worker user failed: ${authError?.message ?? 'no session'}`
      );
    }
    const role = (auth.user?.role ?? '').trim();
    if (role !== 'rate_worker') {
      throw new Error(`The signed-in user has role '${role}', not rate_worker; refusing to run.`);
    }
    const supabase = scopeSupabaseToRate(client);
    // The gateway key is read only for a run that may call it. DOS_AI_BASE_URL alone
    // overrides the gateway (beta-api.dos.ai, say); AI_BASE_URL is the other
    // importer jobs' and may name another provider.
    const apiKey = (process.env.DOS_AI_API_KEY || '').trim();
    const baseUrl = (process.env.DOS_AI_BASE_URL || DOS_AI_DEFAULT_BASE_URL).trim();
    if (!/^https:\/\/[^/\s]+(\/[^\s]*)?$/.test(baseUrl)) {
      throw new Error('DOS_AI_BASE_URL must be an https URL.');
    }
    const ai = apply && apiKey ? dosAiReviewAiClient(apiKey, baseUrl) : null;
    logger.info(
      'review_ai.target',
      `Target: ${host} (${apply ? 'apply' : 'dry run'}, ${enabled ? 'enabled' : 'disabled'}, ${modelName})`,
      { host }
    );
    try {
      const result = await runReviewAiPointsJob(supabase, {
        apply,
        enabled,
        model: modelName,
        purge: argValue('--purge'),
        maxReviews: max === null ? undefined : Number(max),
        waitMs: waitMinutes === null ? undefined : Number(waitMinutes) * 60 * 1000,
        ai,
      });
      if (result.capped) process.exitCode = 3;
      else if (result.stored.unquoted > 0 || result.stored.exhausted > 0) process.exitCode = 2;
    } finally {
      await client.auth.signOut().catch(() => undefined);
    }
  })().catch((err: unknown) => {
    logger.error(
      'review_ai.fatal',
      `Review AI points job failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
