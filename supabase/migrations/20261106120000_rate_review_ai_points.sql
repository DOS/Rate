-- =============================================================================
-- Migration: 20261106120000_rate_review_ai_points.sql
-- Purpose (DOS/Rate#1531): D6 of the DOS/Rate AI review points design
-- (Docs/Proposals/2026-11-03-ai-review-points.html; all six decisions approved by JOY on
-- 2026-11-03: "Duyệt theo khuyến nghị"). It needs P2 (20261101120000_rate_criteria_ratings.sql)
-- and P3 (20261102090000_rate_review_submission_v2.sql). Copied unchanged from the reviewed
-- DOS/Rate proposal Docs/Proposals/2026-11-03-dos-me-review-ai-points.sql (DOS/Rate#1597)
-- apart from this header. One transaction.
-- Verify: scripts/ops/rate-review-ai-points-verify.sql (V1 to V7 return 0).
-- Rollback: scripts/ops/rate-review-ai-points-rollback.sql.
--
-- The marker (rate.review_ai_extractions), the batch record (rate.review_ai_batches) and the
-- writer (rate.store_review_ai_points) of the review AI points job; rate_worker still has no
-- direct write on rate.review_points. No rating changes at apply: nothing reads 'ai' lines
-- yet. Details in the proposal's header, below.
-- =============================================================================
--
-- =============================================================================
-- PROPOSAL (DOS/Rate#1531, D6 of Docs/Proposals/2026-11-03-ai-review-points.html; all six
-- decisions approved by JOY on 2026-11-03 as recommended): the database side of the AI
-- extraction of pros and cons from marketplace reviews (rate.review_points method 'ai'). A
-- DOS-Me migration to review and apply; nothing here is applied by DOS/Rate.
-- Verify: 2026-11-03-dos-me-review-ai-points-verify.sql (V1 to V7 return 0).
-- Rollback: 2026-11-03-dos-me-review-ai-points-rollback.sql.
--
-- What it adds:
--   rate.review_ai_batches       one row per Batch API batch the job sends: its id (kept the
--                                moment the batch is created, so a crashed run collects it
--                                instead of paying twice), the manifest (review ids, refs and
--                                text hashes; never review text), the cost reserved before
--                                sending and the cost the API reported. The month's spend per
--                                model is read from here (design section 8). rate_worker reads,
--                                inserts and updates it until it is stored; nobody deletes
--                                through the API.
--   rate.review_ai_extractions   the process-once marker, one row per review: the NFC text hash,
--                                prompt version, criteria version, category and model it was
--                                processed with, the outcome (stored, empty, rejected, failed),
--                                the attempts of a failed result (at most 3), the version that
--                                wrote its lines, and the evidence quote of each line.
--                                rate_worker reads it; only the functions write.
--   rate.review_ai_text_hash(text)   sha256 hex of the text in Unicode NFC; the job hashes the
--                                same way (the replay compares them).
--   rate.store_review_ai_points(p_rows)   the writer for the job (rate_worker) and service_role:
--                                the 'ai' lines of a review and its marker in one transaction.
--                                Only crawled user reviews with no writer lines; at most 3 pros
--                                and 3 cons, lines 5 to 150 characters with words, no evasive
--                                con, no line twice, criterion keys of the review's category
--                                list, an evidence quote per line found in the comment.
--   rate.purge_review_ai_points(p_prompt_version)   removes every 'ai' line and marker ('all'),
--                                or those of one prompt version (the job's --purge).
--
-- rate_worker still has only SELECT on rate.review_points: 'ai' lines come only through the
-- writer, as writer lines come only through the review RPC.
--
-- Depends on P2 (20261101120000) and P3 (20261102090000, rate.rating_criteria and the line
-- helpers); both are in production.
--
-- Rating impact at apply time: none. Nothing reads 'ai' lines yet: the P2 rating never read
-- review_points, P6 counts only 'writer' lines, and product-points reads 'writer' lines until
-- its 'ai' change ships (D4).
--
-- Idempotent: IF NOT EXISTS for tables and indexes, CREATE OR REPLACE for functions, DROP ...
-- IF EXISTS before each policy. One transaction.
-- =============================================================================

BEGIN;

-- 1. rate.review_ai_batches --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rate.review_ai_batches (
  -- The Batch API's id (msgbatch_...).
  id                 text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{8,128}$'),
  model              text NOT NULL CHECK (model ~ '^[a-z0-9][a-z0-9.-]{1,63}$'),
  prompt_version     text NOT NULL CHECK (prompt_version ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
  status             text NOT NULL DEFAULT 'submitted'
                     CHECK (status IN ('submitted', 'ended', 'stored', 'canceled', 'expired')),
  request_count      integer NOT NULL CHECK (request_count BETWEEN 1 AND 10000),
  review_count       integer NOT NULL CHECK (review_count BETWEEN 1 AND 100000),
  -- [{custom_id, category, criteria_version, reviews: [{ref, id, text_hash}]}]: what each
  -- request carried, so results map back to reviews after a crash. No review text.
  manifest           jsonb NOT NULL
                     CHECK (jsonb_typeof(manifest) = 'array' AND pg_column_size(manifest) <= 1048576),
  -- The ceiling the job reserved before sending (requests x max output, at list price), then
  -- the cost from the usage the API reported. The month's spend counts cost, else the ceiling.
  reserved_usd       numeric(10, 4) NOT NULL CHECK (reserved_usd >= 0),
  cost_usd           numeric(10, 4) CHECK (cost_usd >= 0),
  input_tokens       bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens      bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cache_read_tokens  bigint NOT NULL DEFAULT 0 CHECK (cache_read_tokens >= 0),
  cache_write_tokens bigint NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz,
  stored_at          timestamptz,
  CONSTRAINT review_ai_batches_stored_cost CHECK (status <> 'stored' OR cost_usd IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS review_ai_batches_month_idx
  ON rate.review_ai_batches (model, submitted_at);
CREATE INDEX IF NOT EXISTS review_ai_batches_open_idx
  ON rate.review_ai_batches (submitted_at) WHERE status IN ('submitted', 'ended');

COMMENT ON TABLE rate.review_ai_batches IS
  'Batches the review AI points job sent (DOS/Rate#1531, AI design D6): id, manifest, reserved and reported cost. No review text.';

ALTER TABLE rate.review_ai_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate.review_ai_batches FROM PUBLIC, anon, authenticated, rate_worker;
GRANT ALL ON rate.review_ai_batches TO service_role;
GRANT SELECT, INSERT, UPDATE ON rate.review_ai_batches TO rate_worker;
DROP POLICY IF EXISTS "Service role access review_ai_batches" ON rate.review_ai_batches;
CREATE POLICY "Service role access review_ai_batches" ON rate.review_ai_batches
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Rate worker read review_ai_batches" ON rate.review_ai_batches;
CREATE POLICY "Rate worker read review_ai_batches" ON rate.review_ai_batches
  FOR SELECT TO rate_worker USING (true);
DROP POLICY IF EXISTS "Rate worker insert review_ai_batches" ON rate.review_ai_batches;
CREATE POLICY "Rate worker insert review_ai_batches" ON rate.review_ai_batches
  FOR INSERT TO rate_worker WITH CHECK (true);
DROP POLICY IF EXISTS "Rate worker update review_ai_batches" ON rate.review_ai_batches;
-- A stored batch is closed: its cost, which the month's cap reads, cannot be rewritten.
CREATE POLICY "Rate worker update review_ai_batches" ON rate.review_ai_batches
  FOR UPDATE TO rate_worker USING (status <> 'stored') WITH CHECK (true);

-- 2. rate.review_ai_extractions ----------------------------------------------------------------
-- A review is done while its marker has the same text hash, prompt version, criteria version
-- and category, unless the outcome is 'failed' with fewer than 3 attempts (a cut-off or refused
-- result is never recorded as 'empty'; it is retried at most twice, and the writer refuses a
-- fourth attempt).

CREATE TABLE IF NOT EXISTS rate.review_ai_extractions (
  review_id        uuid PRIMARY KEY REFERENCES rate.reviews(id) ON DELETE CASCADE,
  text_hash        text NOT NULL CHECK (text_hash ~ '^[0-9a-f]{64}$'),
  -- 'all' is the purge's word for every version, so no version is called that.
  prompt_version   text NOT NULL CHECK (prompt_version ~ '^[a-z0-9][a-z0-9._-]{0,31}$'
                                        AND prompt_version <> 'all'),
  criteria_version integer NOT NULL CHECK (criteria_version >= 1),
  -- The category of the review's master when it was processed: a move to another category
  -- makes the review due again.
  category_slug    text NOT NULL CHECK (category_slug ~ '^[a-z_-]{2,64}$'),
  model            text NOT NULL CHECK (model ~ '^[a-z0-9][a-z0-9.-]{1,63}$'),
  -- stored: lines written; empty: the model found nothing; rejected: every line it returned
  -- failed the job's checks; failed: cut off (max_tokens), refused or errored, to retry.
  outcome          text NOT NULL CHECK (outcome IN ('stored', 'empty', 'rejected', 'failed')),
  -- The 'ai' lines of the review now, and the prompt version that wrote them (a failed retry
  -- under a new version keeps the lines of the old one; the purge reads this).
  point_count      smallint NOT NULL DEFAULT 0 CHECK (point_count BETWEEN 0 AND 6),
  lines_prompt_version text,
  -- Lines the job dropped (evidence not found, too short, a key of another category...).
  rejected_count   smallint NOT NULL DEFAULT 0 CHECK (rejected_count BETWEEN 0 AND 20),
  attempts         smallint NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
  -- [{kind, criterion_key, position, evidence, match}] of the review's lines; match is
  -- 'exact' or 'unaccented' (found only without diacritics, counted apart by the job).
  evidence         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  batch_id         text REFERENCES rate.review_ai_batches(id) ON DELETE SET NULL,
  processed_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_ai_extractions_stored CHECK (outcome <> 'stored' OR point_count > 0),
  CONSTRAINT review_ai_extractions_failed CHECK (outcome = 'failed' OR attempts = 1),
  CONSTRAINT review_ai_extractions_lines CHECK ((point_count > 0) = (lines_prompt_version IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS review_ai_extractions_version_idx
  ON rate.review_ai_extractions (prompt_version);
CREATE INDEX IF NOT EXISTS review_ai_extractions_lines_version_idx
  ON rate.review_ai_extractions (lines_prompt_version) WHERE lines_prompt_version IS NOT NULL;
CREATE INDEX IF NOT EXISTS review_ai_extractions_batch_idx
  ON rate.review_ai_extractions (batch_id) WHERE batch_id IS NOT NULL;

COMMENT ON TABLE rate.review_ai_extractions IS
  'Process-once marker of the review AI points job (DOS/Rate#1531, AI design D6). Written only by rate.store_review_ai_points and rate.purge_review_ai_points.';

ALTER TABLE rate.review_ai_extractions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate.review_ai_extractions FROM PUBLIC, anon, authenticated, rate_worker;
GRANT ALL ON rate.review_ai_extractions TO service_role;
GRANT SELECT ON rate.review_ai_extractions TO rate_worker;
DROP POLICY IF EXISTS "Service role access review_ai_extractions" ON rate.review_ai_extractions;
CREATE POLICY "Service role access review_ai_extractions" ON rate.review_ai_extractions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Rate worker read review_ai_extractions" ON rate.review_ai_extractions;
CREATE POLICY "Rate worker read review_ai_extractions" ON rate.review_ai_extractions
  FOR SELECT TO rate_worker USING (true);

-- 3. The text hash -----------------------------------------------------------------------------
-- The review's comment as the job sent it: Unicode NFC, UTF-8, sha256, lower-case hex. The job
-- computes createHash('sha256').update(comment.normalize('NFC'), 'utf8').

CREATE OR REPLACE FUNCTION rate.review_ai_text_hash(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.encode(pg_catalog.sha256(
           pg_catalog.convert_to(normalize(COALESCE(p_text, ''), NFC), 'UTF8')), 'hex')
$$;

REVOKE ALL ON FUNCTION rate.review_ai_text_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.review_ai_text_hash(text) TO service_role, rate_worker;

-- 4. The writer --------------------------------------------------------------------------------
-- p_rows: a JSON array of at most 500 rows and 2 MB, each
--   {"id": review uuid, "text_hash": hex, "prompt_version": "...", "criteria_version": n,
--    "category": slug, "model": "...", "batch_id": "..." | null, "failed": true | false,
--    "rejected": 0-20 (optional),
--    "points": [{"kind": "pro" | "con", "criterion_key": key | null, "body": "...",
--                "evidence": "...", "match": "exact" | "unaccented"}]}
-- "failed" is required, so a cut-off or refused result can never pass as an empty one.
-- Checked for every row before anything is written; one malformed row fails the call (22023,
-- with its index):
--   the shape and types above; a failed row carries no points;
--   (category, criteria_version) a list in rate.rating_criteria, every criterion key in it;
--   at most 3 pros and 3 cons; each body 5 to 150 characters as stored (review_text_stored)
--   with words in it, a con not evasive, no line twice across pros and cons (compared form);
--   each evidence 2 to 300 characters as stored, at least two words.
-- A batch_id must be a row of rate.review_ai_batches (else 23503, from its foreign key).
-- Then, per review (a review listed twice: the last row wins), in id order, after the reviews
-- are locked FOR NO KEY UPDATE in id order (two calls never interleave on one review), each
-- row is one of:
--   'missing'    the review no longer exists;
--   'not_crawl'  it is not a crawled user review (origin 'crawl', reviewer_type 'user');
--   'writer'     it has a writer line: writer lines are never mixed with 'ai';
--   'stale'      its comment no longer hashes to text_hash, or its master is in another
--                category now: the job sends it again with what it is now;
--   'unquoted'   an 'exact' evidence quote is not in the comment (compared form, as P3
--                compares lines): nothing is written, and the job reports it;
--   'done'       a failed row for a review whose marker already holds a result of the same
--                text, prompt version, criteria version and category: the result stays;
--   'exhausted'  a failed row for a review already failed 3 times with the same key: refused
--                as a fourth attempt;
--   'failed'     the marker says failed and counts the attempt (1 under a new key); the
--                review's lines and their evidence stay, with the version that wrote them;
--   'stored', 'rejected', 'empty'   the review's 'ai' lines are replaced by its points
--                (position 0 to 2 per kind), and the marker says which.
-- Returns the count of each.
CREATE OR REPLACE FUNCTION rate.store_review_ai_points(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_point jsonb;
  v_index integer := 0;
  v_pros integer;
  v_cons integer;
  v_seen text[];
  v_compared text;
  v_body text;
  v_len integer;
  v_evidence text;
  v_review record;
  v_marker rate.review_ai_extractions%ROWTYPE;
  v_same_key boolean;
  v_outcome text;
  v_count integer;
  v_result jsonb := '{"stored": 0, "empty": 0, "rejected": 0, "failed": 0, "missing": 0, "not_crawl": 0, "writer": 0, "stale": 0, "unquoted": 0, "done": 0, "exhausted": 0}'::jsonb;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 500 OR octet_length(p_rows::text) > 2097152 THEN
    RAISE EXCEPTION 'at most 500 rows and 2 MB per call' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
       OR v_row - ARRAY['id', 'text_hash', 'prompt_version', 'criteria_version', 'category',
                        'model', 'batch_id', 'failed', 'rejected', 'points'] <> '{}'::jsonb
       OR NOT v_row ?& ARRAY['id', 'text_hash', 'prompt_version', 'criteria_version', 'category',
                            'model', 'failed', 'points']
       OR jsonb_typeof(v_row -> 'id') IS DISTINCT FROM 'string'
       OR (v_row ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(v_row -> 'text_hash') IS DISTINCT FROM 'string'
       OR (v_row ->> 'text_hash') !~ '^[0-9a-f]{64}$'
       OR jsonb_typeof(v_row -> 'prompt_version') IS DISTINCT FROM 'string'
       OR (v_row ->> 'prompt_version') !~ '^[a-z0-9][a-z0-9._-]{0,31}$'
       OR v_row ->> 'prompt_version' = 'all'
       OR jsonb_typeof(v_row -> 'criteria_version') IS DISTINCT FROM 'number'
       OR (v_row ->> 'criteria_version') !~ '^[1-9][0-9]{0,5}$'
       OR jsonb_typeof(v_row -> 'category') IS DISTINCT FROM 'string'
       OR (v_row ->> 'category') !~ '^[a-z_-]{2,64}$'
       OR jsonb_typeof(v_row -> 'model') IS DISTINCT FROM 'string'
       OR (v_row ->> 'model') !~ '^[a-z0-9][a-z0-9.-]{1,63}$'
       OR jsonb_typeof(v_row -> 'batch_id') NOT IN ('string', 'null')
       OR (jsonb_typeof(v_row -> 'batch_id') = 'string'
           AND (v_row ->> 'batch_id') !~ '^[A-Za-z0-9_-]{8,128}$')
       OR jsonb_typeof(v_row -> 'failed') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(v_row -> 'rejected') NOT IN ('number', 'null')
       OR (jsonb_typeof(v_row -> 'rejected') = 'number'
           AND (v_row ->> 'rejected') !~ '^([0-9]|1[0-9]|20)$')
       OR jsonb_typeof(v_row -> 'points') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_row -> 'points') > 6
       OR ((v_row ->> 'failed')::boolean AND jsonb_array_length(v_row -> 'points') > 0) THEN
      RAISE EXCEPTION 'row % is not a review AI result', v_index USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM rate.rating_criteria
                   WHERE criteria_version = (v_row ->> 'criteria_version')::integer
                     AND category_slug = v_row ->> 'category') THEN
      RAISE EXCEPTION 'row % has no criteria list %/%', v_index, v_row ->> 'category',
        v_row ->> 'criteria_version' USING ERRCODE = '22023';
    END IF;

    v_pros := 0;
    v_cons := 0;
    v_seen := '{}';
    FOR v_point IN SELECT value FROM jsonb_array_elements(v_row -> 'points') LOOP
      IF jsonb_typeof(v_point) IS DISTINCT FROM 'object'
         OR v_point - ARRAY['kind', 'criterion_key', 'body', 'evidence', 'match'] <> '{}'::jsonb
         OR NOT v_point ?& ARRAY['kind', 'criterion_key', 'body', 'evidence', 'match']
         OR jsonb_typeof(v_point -> 'kind') IS DISTINCT FROM 'string'
         OR (v_point ->> 'kind') NOT IN ('pro', 'con')
         OR jsonb_typeof(v_point -> 'criterion_key') NOT IN ('string', 'null')
         OR jsonb_typeof(v_point -> 'body') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_point -> 'evidence') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_point -> 'match') IS DISTINCT FROM 'string'
         OR (v_point ->> 'match') NOT IN ('exact', 'unaccented') THEN
        RAISE EXCEPTION 'row % has a line that is not a review AI line', v_index
          USING ERRCODE = '22023';
      END IF;
      IF v_point ->> 'kind' = 'pro' THEN
        v_pros := v_pros + 1;
      ELSE
        v_cons := v_cons + 1;
      END IF;
      v_body := rate.review_text_stored(v_point ->> 'body');
      v_len := rate.review_text_length(v_body);
      v_evidence := rate.review_text_stored(v_point ->> 'evidence');
      v_compared := rate.review_point_compare(v_body);
      IF v_pros > 3 OR v_cons > 3
         OR v_len < 5 OR v_len > 150
         OR NOT rate.review_point_has_content(v_body)
         OR (v_point ->> 'kind' = 'con' AND rate.review_point_is_evasive_con(v_body))
         OR v_compared = ANY (v_seen)
         OR rate.review_text_length(v_evidence) NOT BETWEEN 2 AND 300
         OR rate.review_point_compare(v_evidence) !~ ' '
         OR (jsonb_typeof(v_point -> 'criterion_key') = 'string'
             AND NOT EXISTS (SELECT 1 FROM rate.rating_criteria
                             WHERE criteria_version = (v_row ->> 'criteria_version')::integer
                               AND category_slug = v_row ->> 'category'
                               AND key = v_point ->> 'criterion_key')) THEN
        RAISE EXCEPTION 'row % has a line out of range', v_index USING ERRCODE = '22023';
      END IF;
      v_seen := v_seen || v_compared;
    END LOOP;
    v_index := v_index + 1;
  END LOOP;

  PERFORM 1 FROM rate.reviews r
  WHERE r.id IN (SELECT (e ->> 'id')::uuid FROM jsonb_array_elements(p_rows) e)
  ORDER BY r.id
  FOR NO KEY UPDATE;

  FOR v_row IN
    SELECT DISTINCT ON ((e ->> 'id')::uuid) e
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS a(e, n)
    ORDER BY (e ->> 'id')::uuid, n DESC
  LOOP
    SELECT r.id, r.comment, r.origin, r.reviewer_type, c.slug AS category,
           EXISTS (SELECT 1 FROM rate.review_points rp
                   WHERE rp.review_id = r.id AND rp.method = 'writer') AS has_writer
    INTO v_review
    FROM rate.reviews r
    LEFT JOIN rate.products p ON p.id = r.product_id AND p.origin = 'crawl'
    LEFT JOIN rate.master_products m ON m.id = p.cluster_id
    LEFT JOIN rate.categories c ON c.id = m.category_id
    WHERE r.id = (v_row ->> 'id')::uuid;
    v_outcome := CASE
      WHEN NOT FOUND THEN 'missing'
      WHEN v_review.origin IS DISTINCT FROM 'crawl'
           OR v_review.reviewer_type IS DISTINCT FROM 'user' THEN 'not_crawl'
      WHEN v_review.has_writer THEN 'writer'
      WHEN rate.review_ai_text_hash(v_review.comment) <> v_row ->> 'text_hash'
           OR v_review.category IS DISTINCT FROM v_row ->> 'category' THEN 'stale'
      WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_row -> 'points') p
                   WHERE p ->> 'match' = 'exact'
                     AND strpos(rate.review_point_compare(v_review.comment),
                                rate.review_point_compare(p ->> 'evidence')) = 0) THEN 'unquoted'
    END;
    IF v_outcome IS NOT NULL THEN
      v_result := jsonb_set(v_result, ARRAY[v_outcome], to_jsonb((v_result ->> v_outcome)::integer + 1));
      CONTINUE;
    END IF;

    SELECT * INTO v_marker FROM rate.review_ai_extractions WHERE review_id = v_review.id;
    v_same_key := FOUND
      AND v_marker.text_hash = v_row ->> 'text_hash'
      AND v_marker.prompt_version = v_row ->> 'prompt_version'
      AND v_marker.criteria_version = (v_row ->> 'criteria_version')::integer
      AND v_marker.category_slug = v_row ->> 'category';

    IF (v_row ->> 'failed')::boolean THEN
      v_outcome := CASE WHEN v_same_key AND v_marker.outcome <> 'failed' THEN 'done'
                        WHEN v_same_key AND v_marker.attempts >= 3 THEN 'exhausted'
                        ELSE 'failed' END;
      IF v_outcome = 'failed' THEN
        INSERT INTO rate.review_ai_extractions AS x (
          review_id, text_hash, prompt_version, criteria_version, category_slug, model, outcome,
          point_count, lines_prompt_version, rejected_count, attempts, evidence, batch_id,
          processed_at)
        VALUES (v_review.id, v_row ->> 'text_hash', v_row ->> 'prompt_version',
                (v_row ->> 'criteria_version')::integer, v_row ->> 'category', v_row ->> 'model',
                'failed', 0, NULL, 0, 1, '[]'::jsonb, v_row ->> 'batch_id', now())
        ON CONFLICT (review_id) DO UPDATE
          SET attempts = CASE WHEN v_same_key THEN x.attempts + 1 ELSE 1 END,
              text_hash = EXCLUDED.text_hash,
              prompt_version = EXCLUDED.prompt_version,
              criteria_version = EXCLUDED.criteria_version,
              category_slug = EXCLUDED.category_slug,
              model = EXCLUDED.model,
              outcome = 'failed',
              rejected_count = 0,
              batch_id = EXCLUDED.batch_id,
              processed_at = EXCLUDED.processed_at;
      END IF;
      v_result := jsonb_set(v_result, ARRAY[v_outcome], to_jsonb((v_result ->> v_outcome)::integer + 1));
      CONTINUE;
    END IF;

    DELETE FROM rate.review_points WHERE review_id = v_review.id AND method = 'ai';
    INSERT INTO rate.review_points (review_id, criterion_key, kind, body, position, method)
    SELECT v_review.id, p ->> 'criterion_key', p ->> 'kind', rate.review_text_stored(p ->> 'body'),
           (row_number() OVER (PARTITION BY p ->> 'kind' ORDER BY n) - 1)::smallint, 'ai'
    FROM jsonb_array_elements(v_row -> 'points') WITH ORDINALITY AS t(p, n);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_outcome := CASE WHEN v_count > 0 THEN 'stored'
                      WHEN COALESCE((v_row ->> 'rejected')::integer, 0) > 0 THEN 'rejected'
                      ELSE 'empty' END;
    INSERT INTO rate.review_ai_extractions AS x (
      review_id, text_hash, prompt_version, criteria_version, category_slug, model, outcome,
      point_count, lines_prompt_version, rejected_count, attempts, evidence, batch_id,
      processed_at)
    VALUES (v_review.id, v_row ->> 'text_hash', v_row ->> 'prompt_version',
            (v_row ->> 'criteria_version')::integer, v_row ->> 'category', v_row ->> 'model',
            v_outcome, v_count, CASE WHEN v_count > 0 THEN v_row ->> 'prompt_version' END,
            COALESCE((v_row ->> 'rejected')::integer, 0), 1,
            COALESCE((SELECT jsonb_agg(s.line ORDER BY s.n)
                      FROM (SELECT n, jsonb_build_object(
                                     'kind', p ->> 'kind', 'criterion_key', p -> 'criterion_key',
                                     'position', row_number() OVER (PARTITION BY p ->> 'kind' ORDER BY n) - 1,
                                     'evidence', rate.review_text_stored(p ->> 'evidence'),
                                     'match', p ->> 'match') AS line
                            FROM jsonb_array_elements(v_row -> 'points') WITH ORDINALITY AS t(p, n)) s),
                     '[]'::jsonb),
            v_row ->> 'batch_id', now())
    ON CONFLICT (review_id) DO UPDATE
      SET text_hash = EXCLUDED.text_hash,
          prompt_version = EXCLUDED.prompt_version,
          criteria_version = EXCLUDED.criteria_version,
          category_slug = EXCLUDED.category_slug,
          model = EXCLUDED.model,
          outcome = EXCLUDED.outcome,
          point_count = EXCLUDED.point_count,
          lines_prompt_version = EXCLUDED.lines_prompt_version,
          rejected_count = EXCLUDED.rejected_count,
          attempts = 1,
          evidence = EXCLUDED.evidence,
          batch_id = EXCLUDED.batch_id,
          processed_at = EXCLUDED.processed_at;
    v_result := jsonb_set(v_result, ARRAY[v_outcome], to_jsonb((v_result ->> v_outcome)::integer + 1));
  END LOOP;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION rate.store_review_ai_points(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.store_review_ai_points(jsonb) TO service_role, rate_worker;

-- 5. The purge ---------------------------------------------------------------------------------
-- 'all': every 'ai' line and every marker. A version: every marker of that version or holding
-- lines it wrote (lines_prompt_version, so lines kept through a failed retry under a later
-- version go too), with all the 'ai' lines of those reviews; they are processed again on the
-- next run. There is no default: a bare call is refused. The reviews concerned are locked in
-- id order first, as the writer locks them, so a purge and a store never leave a line without
-- its marker. Batches stay (they hold the month's spend). The next product-points run
-- aggregates without the lines; no writer line is touched. Returns {"lines": n, "markers": n}.
CREATE OR REPLACE FUNCTION rate.purge_review_ai_points(p_prompt_version text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_all boolean := p_prompt_version = 'all';
  v_lines integer;
  v_markers integer;
BEGIN
  IF p_prompt_version IS NULL
     OR (NOT v_all AND p_prompt_version !~ '^[a-z0-9][a-z0-9._-]{0,31}$') THEN
    RAISE EXCEPTION 'p_prompt_version must be ''all'' or a prompt version' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM rate.reviews r
  WHERE r.id IN (SELECT x.review_id FROM rate.review_ai_extractions x
                 WHERE v_all OR x.prompt_version = p_prompt_version
                    OR x.lines_prompt_version = p_prompt_version
                 UNION
                 SELECT rp.review_id FROM rate.review_points rp WHERE v_all AND rp.method = 'ai')
  ORDER BY r.id
  FOR NO KEY UPDATE;

  DELETE FROM rate.review_points rp
  WHERE rp.method = 'ai'
    AND (v_all OR rp.review_id IN (SELECT x.review_id FROM rate.review_ai_extractions x
                                   WHERE x.prompt_version = p_prompt_version
                                      OR x.lines_prompt_version = p_prompt_version));
  GET DIAGNOSTICS v_lines = ROW_COUNT;
  DELETE FROM rate.review_ai_extractions x
  WHERE v_all OR x.prompt_version = p_prompt_version OR x.lines_prompt_version = p_prompt_version;
  GET DIAGNOSTICS v_markers = ROW_COUNT;
  RETURN jsonb_build_object('lines', v_lines, 'markers', v_markers);
END $$;

REVOKE EXECUTE ON FUNCTION rate.purge_review_ai_points(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.purge_review_ai_points(text) TO service_role, rate_worker;

COMMIT;
