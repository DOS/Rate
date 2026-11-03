# DOS-Me proposal: review AI points, the marker and the writer (D6)

DOS/Rate#1531, D6 of `Docs/Proposals/2026-11-03-ai-review-points.html` (all six decisions
approved by JOY on 2026-11-03: "Duyệt theo khuyến nghị"). Status: **proposal, nothing
applied.** It goes through DOS-Me like P2, P3 and P6.

| File                                              | What                                                    |
| ------------------------------------------------- | ------------------------------------------------------- |
| `2026-11-03-dos-me-review-ai-points.sql`          | the migration, one transaction                          |
| `2026-11-03-dos-me-review-ai-points-verify.sql`   | read-only checks, V1 to V7 return 0 (V8 is information) |
| `2026-11-03-dos-me-review-ai-points-rollback.sql` | removes the 'ai' lines, the functions and tables        |
| `scripts/test-review-ai-points-proposal.mjs`      | replays it all on PostgreSQL in Docker                  |

## What it does

- **`rate.review_ai_batches`** (new): one row per Batch API batch the job sends.
  - It holds the batch id, written the moment the batch is created. A run that crashes
    collects that batch next time instead of sending the reviews again.
  - The manifest maps each request to its reviews: review ids, refs and text hashes. It
    never holds review text.
  - The cost: the ceiling the job reserved before sending, then the cost from the usage the
    API reported. The month's spend per model is read from here (design section 8).
  - `rate_worker` reads and inserts it, and updates a batch until it is stored. A stored
    batch's cost, which the monthly cap reads, is closed to it. No role but `service_role`
    deletes.
- **`rate.review_ai_extractions`** (new): the process-once marker, one row per review.
  - The key: the NFC text hash, prompt version, criteria version and category it was
    processed with, plus the model. A review is due again when any part of the key changes,
    including a move of its master to another category.
  - The outcome: `stored`, `empty` (the model found nothing), `rejected` (every line it
    returned failed the job's checks) or `failed` (cut off, refused or errored).
  - A failed result is never recorded as `empty`: the writer requires the `failed` flag on
    every row. It counts attempts; the writer refuses a fourth attempt with the same key, and
    the table holds at most 3.
  - The prompt version that wrote the review's lines. A failed retry under a new version keeps
    the old lines, and the purge of the old version still finds them.
  - The evidence quote of each line, for the weekly read-back (design 7.2).
  - `rate_worker` reads it. Only the two functions write it.
- **`rate.review_ai_text_hash(text)`**: sha256 hex of the text in NFC. The job computes the
  same hash; the replay checks they agree, decomposed diacritics included.
- **`rate.store_review_ai_points(p_rows)`**, for `rate_worker` and `service_role`.
  - It writes a review's 'ai' lines and its marker in one transaction.
  - Up to 500 rows and 2 MB per call. One malformed row refuses the whole call (22023, with
    the row's index), before anything is written.
  - Each line is checked:
    - at most 3 pros and 3 cons;
    - 5 to 150 characters with words in it, stored as P3 stores a line;
    - a con that only dodges ("không có gì để chê") is refused;
    - no line twice, including as both a pro and a con;
    - the criterion key is null or in the category's criteria list of that version;
    - an evidence quote of 2 to 300 characters and at least two words.
  - A batch id must be a row of `rate.review_ai_batches`; an unknown one fails with 23503.
  - Some reviews are skipped and counted, not refused, so one odd review never stops a night:
    - `missing`: the review no longer exists;
    - `not_crawl`: not a crawled user review (a community or expert review);
    - `writer`: it has a writer line; 'ai' and writer lines never mix;
    - `stale`: its comment changed since it was sent (the hash differs), or its master is in
      another category now. The job sends it again;
    - `unquoted`: a quote marked `exact` is not in the comment, compared as P3 compares lines.
      Nothing is written and the job reports it. A quote marked `unaccented` (found only
      without diacritics) is checked by the job alone;
    - `done`: a failed result for a review that already has a result with the same key. A late
      or duplicate failure never undoes a result;
    - `exhausted`: a fourth failed attempt with the same key.
  - The reviews are locked in id order first, so two calls never interleave on one review.
- **`rate.purge_review_ai_points(p_prompt_version)`**: the job's `--purge`.
  - `'all'` removes every 'ai' line and marker. A version removes the markers of that version
    or holding lines it wrote, with all the 'ai' lines of those reviews; they are processed
    again on the next run.
  - There is no default: a bare call does not exist, so nothing is purged by accident. No
    prompt version may be called `all`.
  - It locks its reviews in the writer's order, so a purge and a store never leave a line
    without its marker.
  - Batches stay, since they hold the month's spend. Writer lines are never touched.

`rate_worker` still has only SELECT on `rate.review_points`. 'ai' lines come only through the
writer, as writer lines come only through the review RPC.

**Rating impact at apply time: none.** Nothing reads 'ai' lines yet:

- the P2 rating never reads `review_points`;
- P6 counts only 'writer' lines;
- product-points reads only 'writer' lines until its D4 change ships.

## Order and dependencies

- **Needs:** P2 (`20261101120000`) and P3 (`20261102090000`, for `rate.rating_criteria` and
  the line helpers). Both are in production.
- **After the apply:**
  - The job (`apps/importer`, a follow-up PR) runs dry by default. Only with `--apply` does
    it send batches and call the writer, as `rate_worker`.
  - Rate-Services schedules it after a dry run and holds the API key. Nothing calls a model
    before that.
  - Run one job at a time. The batches table is how a second run would see the first one's
    open batch.

## Decisions

The design's D6 named one table and one function. This proposal adds three things to it:

1. **A second table for batches**, rather than keeping the spend in the marker. One request
   carries up to 20 reviews, so its cost belongs to the batch, not to each review. A batch also
   exists before any review has a result, and that is when its id must be kept.
2. **A purge function**, rather than a purge mode in the writer. Each function then does one
   thing, and its grant says so.
3. **`rate_worker` writes the batches table directly.** It is the job's own bookkeeping: it
   holds no review text, and no page or rating reads it. Its CHECKs keep it well-formed, and a
   stored batch is closed to it. Until a batch is stored, the worker could lower its reserved
   cost and so loosen the cap; the cap guards against a looping job, not against the worker's
   own credentials. The lines and the markers, which pages and the aggregation read, stay
   behind the writer.

Known limits:

- If the job dies between creating a batch and inserting its row, that batch is paid for but
  not collected, and its reviews are sent again. The window is one HTTP call, and the cost is
  at most one night's batch (under $0.20 with Haiku).
- The database checks an `exact` quote against the comment but not an `unaccented` one: it
  has no diacritic folding. The job checks both, and counts `unaccented` lines apart.
- The replay runs one session, so it does not exercise two calls blocking on each other's
  locks; the lock order is the same as P6's writer.

## Apply

1. Copy the `.sql` into DOS-Me `supabase/migrations/` with a new timestamp, and the verify and
   rollback files into `scripts/ops/`, as for P6.
2. After the beta and production applies, run the verify file read-only as `postgres` or
   `service_role`. V1 to V7 must return 0. Run it again after each job run.
3. **Rollback:** the rollback file, safe to run twice. Stop the job first
   (`REVIEW_AI_POINTS_ENABLED=false`) and cancel any open batch.
   - It deletes every 'ai' line, then the functions and both tables. Writer lines stay.
   - The batch records, and so the month's spend, are lost: copy them first if wanted.
   - The job can extract the lines again after a re-apply, at the cost of the model calls.

## Tests (local, Docker)

`node scripts/test-review-ai-points-proposal.mjs`:

- the proposal applied twice; no rating moves;
- the hash equal to the job's, for decomposed and composed text, emoji and the empty string;
- a batch row inserted and updated as `rate_worker`;
- lines and markers stored as `rate_worker`:
  - positions per kind, the evidence and its match kind;
  - a review listed twice (the last row wins);
  - a re-store that replaces the lines, and an empty result that clears them;
- the skips: a missing review, a community and an expert review, a review with a writer line,
  a changed comment, a made-up exact quote, a master moved to another category (V5 still 0);
- failed results:
  - a late failure over a result of the same key changes nothing (`done`);
  - under a new key, attempts counted and the old lines kept with their version;
  - a fourth attempt refused (`exhausted`);
  - the purge of the old version finding the kept lines;
- the refusals, where nothing is written:
  - not an array, too many rows;
  - a bad id, hash, version (`all` included), model, batch id, flag, count or key;
  - a row without its `failed` flag, or with a null one;
  - an unknown criteria list, a key of another category;
  - a failed row with points, seven lines, four pros;
  - a short, long, letterless or evasive line, a line both pro and con;
  - one word of evidence, or too much;
  - an unknown batch id (23503);
  - `anon` and `authenticated` calling the writer;
- direct writes stopped:
  - `rate_worker` on `rate.review_points` and on the markers;
  - deleting batches, and updating a stored one;
  - a stored batch without its cost;
- the public reading neither table, and reading 'ai' lines like writer lines;
- the purge of one prompt version, then of everything (`'all'`); a bare call and a bad version
  refused; writer lines stay;
- V1 to V7 after each step, and V8;
- the rollback twice: every object and every 'ai' line gone, writer lines and the rating kept;
- the proposal again, with a store on it.
