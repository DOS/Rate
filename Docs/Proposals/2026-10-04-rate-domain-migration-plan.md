# Rate Domain Model Migration Plan (v7, post round-6 review)

Date: 2026-10-04 | Status: REVISED after rounds 1-5 of adversarial review
Reviewers: Codex gpt-6.1-sol (xhigh) + Gemini-3.8-Flash via dos.ai gateway (Qwen 502'd both rounds). Round trajectory: R1 14 findings (4 blockers); R2 on v2: 5 RES/8 PART/1 NOT + N1-N4; R3 on v3: 9 RES/5 PART/0 NOT + N5-N8; R4 on v4: 11 RES/6 PART/1 NOT + N9-N11; R5 on v5: all previous RESOLVED except 4 PARTIAL + N12-N15 (atomic verdict commit, IMMUTABLE signals helper, listing-scoped price observation id, verdict/run lifecycle RPCs). v6 resolved every round-5 item; v7 resolves the round-6 remainder (N12 locking contract, N16 crawl_runs status) plus the Codex round-7 wording note. **FINAL STATUS: Codex APPROVED-WITH-NOTES (round 7), Gemini APPROVED (convergence check). Cleared to author migration files.** §9-§12 carry changelogs.
Supersedes: v1-v6 (git history).

## 0. Verdict from reviewers (must-fix before any SQL is written)

Reviewers rejected v1 for deployment readiness. Blocking findings, all incorporated below:

| # | Blocker | v2 resolution |
|---|---|---|
| B1 | Migration ownership: `rate` DDL on the SHARED prod `dos` instance must go through the DOS-Me migration ledger, not a Rate-local `supabase/migrations/` folder (repo `supabase/README.md` + ecosystem rule 10) | §1 process change |
| B2 | `CREATE ... IF NOT EXISTS` does not verify/repair drifted objects; recovery must be a *baseline contract* diffed against live prod, and mismatch must abort, not silently no-op | §2 recovery protocol |
| B3 | `match_master_product` RPC signature in v1 was asserted, not verified; changing arg types in CREATE OR REPLACE silently creates an overload; RPC failure currently causes silent new-master creation | §2 + §5 code fix |
| B4 | No replay/preview gate: `v_products_with_merchant_trust` depends on `dosafe.threat_intel`; a clean-branch replay fails before reaching the recovery step; CI does not run migrations | §3 gate |
| B5 | v1 copied public-read RLS to `crawl_jobs`/`crawl_runs` - would expose crawler payloads, params and operational errors | §4 RLS matrix |
| B6 (Gemini) | `FOR UPDATE SKIP LOCKED` cannot run over PostgREST/supabase-js; claim/ack must be atomic SECURITY DEFINER RPCs | §4 queue design |
| B7 (Gemini) | `UNIQUE (merchant_id, captured_at::date)` is an invalid mutable index expression on timestamptz | §4 merchant_snapshots uses `snapshot_date DATE` |

## 1. Process: where migrations live (B1)

- All `rate` DDL files go to **`DOS-Me/supabase/migrations/`** (the sole ledger + CI deploy authority for the shared `dos` instance: public, dosai, dosafe, bexly, nhan, rate, ...). Rate repo keeps: this proposal, the entity/contract docs, and the code that consumes the schema. The existing `Rate/supabase/migrations/20260912000000_init_rate_schema.sql` predates the rule and stays as historical reference; it is NOT a deploy path.
- Rate's responsibility: schema contract + integration tests against a branch preview. DOS-Me's pipeline: preview -> beta -> prod.
- Requires JOY approval for a cross-repo (DOS-Me) PR - explicitly out of autonomous scope.

## 2. Drift recovery protocol (B2, B3) - `20261005000001_rate_recover_master_products.sql`

Before writing the file:
1. Dump live truth from prod: `\d+ rate.master_products`, the RPC definition via the `pg_proc` lookup in step 4 (no regprocedure casts anywhere in this protocol), all constraints/indexes/triggers/RLS/grants/owner on `rate.master_products`, and whether `rate.products.cluster_id` has any FK (v1 assumed it did not; unverified).
2. The migration re-states live prod as committed DDL: `CREATE TABLE IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS uq_master_products_model_key ON rate.master_products(model_key)` (reviewers flagged missing uniqueness; adding it is safe if live data has no dupes - verify with `SELECT model_key, count(*) ... HAVING count(*)>1` BEFORE the migration runs; if dupes exist, stop and dedupe first).
3. **Contract guard** (the part v1 missed; sharpened in round 2 per Codex #2): after the CREATE statements, the verification block must cover the FULL object inventory, not just columns: column list/types/nullability, all constraints (incl. whether `products.cluster_id` has an FK), all indexes, triggers, RLS enablement + policies, grants, table owner, and the RPC's `pg_get_functiondef` + `proconfig`. Any mismatch -> `RAISE EXCEPTION` (abort). Rationale: IF NOT EXISTS on a *wrongly-shaped* existing object must not pass silently, and a partial check (columns only) would still miss drift in constraints/triggers.
4. The RPC is re-expressed with its **verified live signature** (from step 1), never the v1 guess. Signature lookup MUST go through `pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='rate' AND p.proname='match_master_product'` to enumerate overloads and capture arg names/types/order (Codex N1). CREATE OR REPLACE must keep arg names/types/return identical to avoid creating an overload.
4b. **FK for `products.cluster_id` (Gemini round-2 blocker; lock/commit semantics per Codex N8 + round-4 residual)**: gated on the step-1 finding, with THREE separate commit boundaries and correct lock modes:
   - If the FK exists and is already VALIDATED: skip (record in the guard inventory).
   - If the FK exists but is NOT VALID: go straight to the tx2 VALIDATE step (resume path, Codex round-4 N8).
   - If no FK exists: tx1: `ALTER TABLE rate.products ADD CONSTRAINT fk_products_cluster FOREIGN KEY (cluster_id) REFERENCES rate.master_products(id) NOT VALID;` - brief SHARE ROW EXCLUSIVE, metadata-only, reads never blocked. Pre-validate `SELECT` for dangling `cluster_id` values; **if any exist, ABORT with the orphan report and stop** - no auto-NULLing (mapping preserved for JOY's manual decision). tx2 (separate transaction): `ALTER TABLE rate.products VALIDATE CONSTRAINT fk_products_cluster;` - takes SHARE UPDATE EXCLUSIVE (not SHARE ROW EXCLUSIVE), scan-only, concurrent writes allowed.
5. `spec_groups` DROP is REMOVED from this plan (Codex: an empty table with zero references *in this repo* proves nothing about other ecosystem consumers). Filed as a separate question for the DOS-Me owner.

## 3. Replay/preview gate (B4)

- **Mandatory full-ledger replay** (Codex round-2): before merge, replay the ENTIRE DOS-Me ledger from zero on a fresh Supabase branch and require migration status success; a partial replay that happens to pass does not prove the ledger composes. Verify the branch's project identity (the smoke test must read its preview URL, and `rate-api.ts` env-hardening from §5.4 is a prerequisite so the preview cannot silently fall back to reading PROD).
- Branch must carry sibling schemas; verify `dosafe.threat_intel` exists before running. If the branching flow cannot include sibling schemas, the migration file must not touch the view and the gap is documented.
- CI gap acknowledged: current `.github/workflows/ci.yml` builds apps only. Adding a migrations-replay CI job is DOS-Me-side work; Rate side adds the integration smoke test (enqueue -> claim -> ingest 1 fixture product -> assert rows) runnable against the preview URL.

## 4. New tables (migration `20261005000002_rate_platform_tables.sql`, filed in DOS-Me)

### 4.1 Queue: `rate.crawl_jobs` + `rate.crawl_runs` (Postgres queue; BullMQ stays dormant)

Reviewer consensus: Postgres queue is right for a serial, anti-bot-limited crawl (and BullMQ is currently unusable anyway: Redis runs `allkeys-lru`, BullMQ requires `noeviction`). BUT supabase-js speaks PostgREST: no transactions, no FOR UPDATE SKIP LOCKED over REST. Therefore claim/ack/fail are **atomic SECURITY DEFINER PL/pgSQL RPCs**, EXECUTE granted only to `service_role`:

- `rate.crawl_runs(id, source, params jsonb, status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','finished','aborted')), started_at, finished_at, stats jsonb)` (Codex N16: status column + lifecycle; `finish_crawl_run(p_run_id, p_stats)` sets 'finished'; a run still 'running' past `run_timeout` (default 6h) is flipped to 'aborted' by the next dequeue/finish call that touches it - no separate reaper).
- `rate.crawl_jobs`:
  - claim/lease columns: `id, type, platform, status ('pending'|'running'|'done'|'failed'|'skipped'), priority int, payload jsonb (with schema_version), attempts int, max_attempts int, last_error text, run_id uuid FK, leased_at, lease_expires, worker_id text, claim_token uuid NOT NULL DEFAULT gen_random_uuid() (regenerated on every claim - the fencing key, see RPCs), backoff_until timestamptz (exponential backoff on fail: 2^attempts minutes, capped 60m), created_at, updated_at`
  - dedup/identity columns stay real columns, not JSONB (Codex Q2 hybrid): `target_url text`, `platform_item_id text`, `platform_shop_id text`
  - **recrawl semantics (Codex N2)**: the partial unique index on `(platform, platform_item_id)` applies ONLY to live states: `WHERE status IN ('pending','running')` - so terminal jobs (`done`/`failed`) never block a legitimate recrawl. Enqueueing a duplicate while a live job exists does not error: it **supersedes** the old pending job (status -> 'skipped', superseded_by set) and inserts the fresh one. `done`/`failed` history rows are retained for observability.
  - partial index `ON rate.crawl_jobs (priority DESC, created_at) WHERE status IN ('pending','running')`
- RPCs (all SECURITY DEFINER, EXECUTE to service_role only). **Full RPC surface (Codex N15)**: `enqueue_crawl_job`, `dequeue_crawl_job`, `heartbeat_crawl_job`, `checkpoint_crawl_job`, `ack_crawl_job`, `fail_crawl_job`, `start_crawl_run(p_source, p_params) -> run_id`, `finish_crawl_run(p_run_id, p_stats)` (also closes runs abandoned past a max duration -> status 'aborted'). With direct DML revoked on both tables (§4.5), every mutation of jobs and runs goes through these RPCs:
  - `enqueue_crawl_job(...)`: the ONLY write path for jobs (Codex N5). Atomic behavior on identity conflict: if a live `pending` job with the same `(platform, platform_item_id)` exists -> supersede it (status 'skipped', superseded_by) and insert the fresh one; if a `running` job exists -> DO NOT insert (the unique key is held); return the existing job id with `state='running_in_progress'` so the caller subscribes instead of stacking. Every other caller-side INSERT path is blocked by grants.
  - `dequeue_crawl_job(p_worker_id, p_platform, p_lease interval default '10 minutes') RETURNS setof crawl_jobs`: CTE selects `platform = p_platform AND ((status='pending' AND (backoff_until IS NULL OR backoff_until <= now())) OR (status='running' AND lease_expires < now()))` ORDER BY priority DESC, created_at, `FOR UPDATE SKIP LOCKED LIMIT 1`. Platform filter included in the predicate (Codex N6). Reclaim of an expired-lease job whose attempts would exceed max_attempts flips it to 'failed' (zombie-worker loop protection) instead of requeueing; reclaimed jobs also respect backoff (Codex N6). UPDATE sets status='running', `claim_token = gen_random_uuid()`, lease fields, attempts+1; RETURNING includes claim_token. Expired leases are reclaimed by the normal dequeue path - no separate reaper needed (Gemini round-2 new-issue 3).
  - `heartbeat_crawl_job(p_id, p_claim_token, p_extend interval)`: verifies `claim_token` matches the CURRENT lease AND `status='running'` AND `lease_expires > now()` before extending - a fenced extension only; expired leases must go through dequeue re-claim (Codex round-4 #6).
  - `ack_crawl_job(p_id, p_claim_token, p_stats)` / `fail_crawl_job(p_id, p_claim_token, p_error)`: verify `claim_token` matches the CURRENT lease before mutating - fencing by per-claim token, not worker_id. ack sets done + stats; fail sets status='pending' with exponential backoff (2^attempts min, cap 60m) or 'failed' when attempts >= max_attempts.
  - `checkpoint_crawl_job(p_id, p_claim_token, p_progress jsonb)`: updates the per-section progress marker under the same token fence, so a zombie worker cannot advance the checkpoint of a reclaimed job (Codex round-4 #8).
  - Per-platform serialization is achieved by the crawler driver being single-flight per platform - SKIP LOCKED alone does not give ordering (documented contract).
- Runtime validation (Codex #7): enqueue and consume validate payload with zod discriminated unions per `type`+`platform`; a job whose payload fails validation moves straight to `failed` with the validation error as last_error. (Code-side, importer package.)
- Ingestion idempotency prerequisites flagged by Codex #8 (fix in importer code, separate PR, before the queue goes live):
  - reviews without `platform_review_id` get re-inserted every run -> **stable observation id** (sha256 of author+date+comment) written as `platform_review_id` when Shopee's id is absent - this is the dedup key, NOT a time-window heuristic;
  - `price_history`: each observation gets a stable **price observation id scoped to the listing** (Codex N14): `sha256(product_id || '|' || price || '|' || coalesce(price_original,'') || '|' || day_bucket)` written into a new column with a UNIQUE constraint (contract, not convention), so re-crawls within the same day upsert instead of duplicating and cross-platform items can never collide; price-history inserts MUST surface errors (no silent drop);
  - **checkpointed ingest** (Codex round-3 #8): `crawl_jobs.progress jsonb` records per-section completion (`merchant/master/listing/price/reviews`); after a crash, resume starts from the first incomplete section instead of redoing everything; `ack` requires ALL sections complete - partial ingest is never acked as done;
  - review insert failures are warn-then-success -> `ingestProduct` must report partial failure so the job is not acked as done.

### 4.2 `rate.review_flags` (per-review verdict; reviewers agree separate table is right)

`review_id uuid PK REFERENCES rate.reviews(id) ON DELETE CASCADE, fake_probability numeric(4,3) CHECK (0<=x<=1), verdict text CHECK (verdict IN ('authentic','suspicious','fake','unanalyzed')), signals jsonb, detector text NOT NULL, detector_version text NOT NULL, generation bigint NOT NULL DEFAULT 1, input_hash text NOT NULL, analyzed_at timestamptz default now()`.
- Semantics: **current verdict per review** (one row per review, overwritten on re-analysis). Append-only history is explicitly out of scope until an audit requirement exists (Codex Q3).
- **Stale-write guard (Codex N3/N9/N12, final design)**: two service-only RPCs make the lifecycle race-free:
  1. `reserve_review_generation(p_review_id, p_input_hash)` - atomically returns `(generation, input_hash)`. It recomputes the review's CURRENT input hash server-side; if the caller's hash is stale the reservation REFUSES (stale runs cannot start). Same-input re-analysis gets `generation + 1`.
  2. `commit_review_verdict(p_review_id, p_generation, p_input_hash, verdict, probability, signals, detector, detector_version)` (Codex N12) - the ONLY write path to review_flags (direct DML revoked, §4.5). **Locking contract (Codex round-6)**: the RPC runs in a single transaction that FIRST takes `SELECT ... FROM rate.reviews WHERE id = p_review_id FOR UPDATE` (row lock held until commit - blocks concurrent review edits for the brief transaction), THEN verifies (a) a reservation exists with exactly this `(generation, input_hash)` pair and takes `FOR UPDATE` on it, (b) the review's input hash recomputed UNDER THE LOCK still equals `p_input_hash`, and only then upserts the verdict. Under READ COMMITTED with the row locked before the hash check: if a concurrent review edit commits BEFORE the RPC takes the lock, the RPC reads the NEW text and rejects the verdict (hash mismatch); if the edit waits BEHIND the RPC's lock, the verdict lands on the text it was computed from and the edit follows. No TOCTOU window either way.
- Writes only via the commit RPC (service_role).
- **`signals` schema is a closed whitelist, enforced BY THE DATABASE (Codex N7), value-typed per Codex N11, implemented per Codex N13**: `jsonb_each` is set-returning and cannot be walked inside a CHECK expression, so the CHECK calls an `IMMUTABLE` scalar helper `rate.signals_valid(p jsonb) RETURNS boolean` (PL/pgSQL loop over `jsonb_each`, or a JSONPath expression) that enforces: (a) object type, (b) keys within the whitelist, (c) every value is a `number` in [0,1] OR a `string` in the fixed bucket enum (`low|medium|high|unknown`) - no nested objects, no free text. Table DDL: `CHECK (rate.signals_valid(signals))`.

### 4.3 `rate.promotions`

`id, product_id FK, platform, platform_promo_id text, kind text CHECK IN ('flash_sale','voucher','bundle','other'), sku_scope text DEFAULT 'all', discounted_price numeric, original_price numeric, starts_at timestamptz, ends_at timestamptz, raw jsonb, captured_at`.
- **Event identity vs price observation are separated (Codex #10, tightened round 3)**: a promotion ROW is the event - its identity is `(product_id, platform, coalesce(platform_promo_id, fingerprint), sku_scope)` and it does NOT include mutable pricing; `discounted_price/original_price` on the row are the LATEST observed values, updated via upsert. Time-series of price under the promo stays in `price_history` (which gains nullable `promotion_id`). Multiple promos affecting one price is out of scope - single effective promotion recorded.
- Uniqueness (Codex N10, final): TWO non-overlapping partial unique indexes so the fingerprint path can never collide with the platform-id path: (a) `UNIQUE (product_id, platform, platform_promo_id, sku_scope) WHERE platform_promo_id IS NOT NULL`; (b) `UNIQUE (product_id, platform, promo_fingerprint, sku_scope) WHERE platform_promo_id IS NULL`. The fingerprint column is filled only for promos without a platform id (epoch-based canonical serialization per N4) - a platform-id campaign and a fingerprint row with coincidentally equal product/kind/start/SKU can no longer clash.
- Honest scope note (Codex): Shopee scraper today exposes no campaign id / start/end times - promotions stay empty until the scraper is extended; and `price_original` IS already captured (v1 overstated the loss; what is lost is event context).

### 4.4 `rate.merchant_snapshots`

Per Gemini's concrete DDL: `id, merchant_id FK ON DELETE CASCADE, snapshot_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, rating_star, follower_count, product_count, risk_score, captured_at timestamptz NOT NULL DEFAULT now(), UNIQUE (merchant_id, snapshot_date)`.
- Rule: **last write wins within a day** (upsert on the unique pair) - matches reality that a shop may be crawled several times a day.

### 4.5 RLS/grants matrix (B5)

| Table | anon/authenticated | service_role |
|---|---|---|
| review_flags | SELECT | SELECT + INSERT/UPDATE ONLY VIA RPC RESERVE PATH (direct DML revoked - Codex round-4 N5 residual) |
| promotions | SELECT | ALL |
| merchant_snapshots | SELECT | ALL |
| crawl_jobs, crawl_runs | **NONE (no policy, no grant)** | SELECT + RPC EXECUTE only; direct INSERT/UPDATE/DELETE on crawl_jobs **REVOKED** so enqueue/dequeue/ack RPCs are the sole write path (Codex round-4 N5 residual) |
| queue RPCs | n/a | EXECUTE only |

## 5. Code-side fixes surfaced by review (Rate repo, separate PRs, no DDL)

1. `entity-matcher.ts`: RPC error path currently creates a NEW master (silent cluster split). Infra/schema errors must abort ingestion; only a genuine no-match creates a master. Tier 3 insert becomes upsert `onConflict: 'model_key'` with refetch (Gemini B3), plus low-confidence candidates (0.65-0.70) must NOT auto-create masters with `status='published'` - route to a `status='needs_review'` state until the aggregates question below is settled.
2. `product-normalizer.ts` storage-extraction bug (Codex #12, reproduced): "Samsung Galaxy A55 8GB RAM 256GB" parses storage as 8GB (first GB number in title). Fix: identify the RAM number via adjacency to RAM markers (`RAM| Bộ nhớ RAM| dung lượng RAM`), pick the storage candidate AFTER the RAM token (or the token adjacent to `GB|TB` inside storage markers like `ROM`); when no confident storage is found, use `model_key = {brand}:{model}:unknown` AND route the master to `needs_review` instead of publishing a wrong identity. Listing prices must NOT be attached as canonical variant prices until the SKU (models[].modelId) is linked to its variant - storage identity and price attachment are decoupled (Codex #12 remainder).
3. Aggregates on `master_products` (`min_price/max_price/merchant_count/total_reviews/average_rating`) are written by NOTHING in this repo (EntityMatcher only inserts/returns ids). **Codex #11 (round-1, still tracked in rounds 2-4): "unmaintained" is provisional until prod triggers are verified** - the §2.3 guard inventories triggers, and §6.5's wording is therefore "maintained by no repo code; prod-side triggers to be confirmed by the guard". If the guard finds a maintaining trigger, the mechanism decision re-opens; if not: preferred mechanism is a **recompute** (materialized view or scheduled refresh) over listing rows, decided in the follow-up PR with fixed semantics: `merchant_count` = distinct merchants with live listings; `total_reviews` = crawled review count; `average_rating` = review-count-weighted.
4. `rate-api.ts`: fail hard when `SUPABASE_URL` env is missing (currently falls back to prod), stop swallowing errors into `[]` (B4 hazard for preview verification).
5. Gen-1 quality gates worth resurrecting (Codex Q6): category-compatibility check in matching, confidence review queue instead of auto-publish, thresholds calibrated on labeled data - NOT copying 0.95/0.80 numbers blindly.
6. UI hookup (Codex round-2 #9 remainder): when review_flags lands, `getMasterProductReviews` in rate-api.ts gains the verdict join (badge data); UI consumes it in a follow-up frontend PR.

## 6. Answers to v1 open questions (as resolved by reviewers)

1. Keep `products` name (both reviewers); add shared contract type `RateListing` in packages/shared-data; rename only as part of a planned API migration later.
2. Hybrid job payload (columns for identity/claim, JSONB `schema_version`-ed for params) - agreed by both.
3. Separate `review_flags` table - agreed; defined as current-verdict, guarded writes.
4. Promotions dedup: platform promo id when present; fingerprint fallback column; scraper extension required for real data.
5. Aggregates are maintained by no repo code (see 5.3); prod-side triggers are confirmed by the §2.3 guard before the recovery migration merges; the recovery keeps the columns as-is and the mechanism decision happens in the follow-up PR.
6. Do NOT port Gen-1 thresholds blindly; resurrect the gates (category check, review queue), calibrate numbers later.

## 7. Execution order

1. JOY approves cross-repo write -> migration files authored in **DOS-Me** (recovery first, platform tables second), each with the abort-guard blocks.
2. Rate code PRs (can go in parallel): entity-matcher error handling + upsert + needs_review state; normalizer storage fix; ingestion idempotency (review observation id, error propagation, checkpoint); rate-api env hardening.
3. Preview-branch verification: FULL-LEDGER replay from zero on a fresh branch + branch identity check + enqueue->claim->ingest smoke test -> DOS-Me pipeline beta -> prod.
4. BullMQ deps removal + `spec_groups` question -> separate housekeeping PRs.

## 8. Round-2 changelog (what v3 changed vs v2, mapped to reviewer findings)

| Finding | v3 resolution |
|---|---|
| Codex #2 (guard scope) | §2.3: full inventory guard - constraints, indexes, triggers, RLS, grants, owner, proconfig |
| Codex #3 / N1 (RPC signature lookup) | §2.4: pg_proc JOIN pg_namespace enumeration; regprocedure cast removed |
| Codex #4 (replay gate) | §3: mandatory full-ledger replay from zero + branch identity check; rate-api hardening is a prerequisite |
| Codex #6 (queue ops semantics) | §4.1: per-claim `claim_token` fencing, heartbeat RPC, exponential backoff column; single-flight-per-platform documented |
| Codex #7 / N2 (payload validation + recrawl key) | §4.1: zod discriminated unions at enqueue/consume; unique index narrowed to `status IN ('pending','running')` + supersede flow so done/failed never block recrawl |
| Codex #8 (retry-safe ingestion) | §4.1: observation id is THE dedup key (no time-window heuristic); mandatory error surfacing; checkpoint per section |
| Codex #9 / N3 (stale verdict writes) | §4.2: monotonic `generation` CAS guard (not version-string comparison); UI hookup added as §5.6 |
| Codex #10 / N4 (promotion identity) | §4.3: sku_scope column, event-vs-observation separation, epoch-based canonical fingerprint |
| Codex #11 (aggregates "nobody") | §5.3: prod-trigger inventory is part of the §2.3 guard; if present, mechanism decision re-opens; else recompute preferred with fixed semantics |
| Codex #12 (storage identity) | §5.2: RAM-adjacency parsing, `:unknown` model_key + needs_review fallback, SKU-price decoupling |
| Gemini B3 remainder (cluster_id FK) | §2.4b: gated ADD CONSTRAINT NOT VALID -> orphan cleanup -> VALIDATE |
| Gemini new-2 (signals PII) | §4.2: closed-whitelist signals schema, zod-enforced writer, conformance test; service-only sibling as fallback option |
| Gemini new-3 (lease reclaim) | §4.1: dequeue reclaims expired leases inline - no separate reaper |

## 9. Round-3 changelog (what v4 changed vs v3)

| Finding | v4 resolution |
|---|---|
| Codex #3 residual (inconsistent regprocedure in §2.1) | §2.1: removed; pg_proc lookup is the only signature method, referenced from both steps |
| Codex #6 residual (heartbeat fencing) | §4.1: heartbeat verifies claim_token like ack/fail |
| Codex #8 residual (atomic ingest) | §4.1: price observation id column, per-section `progress` checkpoint on crawl_jobs, ack requires all sections |
| Codex #9 residual (generation allocation) | §4.2: generation increments atomically in the upsert; guard on input_hash + generation |
| Codex #10 residual (SKU in dedup, mutable price in fingerprint) | §4.3: sku_scope in the unique key; fingerprint = time-bounded identity only, prices live as updatable latest-observation values |
| Codex N5 (enqueue vs running job) | §4.1: enqueue_crawl_job is the sole write path; running identity returns existing job with 'running_in_progress', never stacks |
| Codex N6 (reclaim limits + platform filter) | §4.1: platform predicate in dequeue; reclaim flips to failed at max_attempts; backoff applies to reclaimed jobs |
| Codex N7 (SQL JSONB whitelist CHECK) | §4.2: v3 claim withdrawn; CHECK with `signals - allowed_keys = '{}'` added, zod stays as first layer |
| Codex N8 (FK lock/commit semantics, orphan NULLing) | §2.4b: three commit boundaries, SHARE ROW EXCLUSIVE named correctly, abort-with-report on orphans (no silent NULLing) |

## 10. Round-4 changelog (what v5 changed vs v4)

| Finding | v5 resolution |
|---|---|
| Codex #6 residual (heartbeat conditions) | §4.1: heartbeat requires claim_token match + status='running' + unexpired lease |
| Codex #8 residual (checkpoint fence + price observation UNIQUE) | §4.1: checkpoint_crawl_job RPC token-fenced; price observation id gets a UNIQUE constraint contract |
| Codex #9 / N3 / N9 (generation allocation, inverted guard) | §4.2: reserve_review_generation RPC allocates generation BEFORE analysis and refuses stale input at reservation time; write guard is generation-ascending AND input-hash-equal |
| Codex #10 / N10 (fingerprint collides with promo-id path) | §4.3: two non-overlapping partial unique indexes (promo-id path vs fingerprint path, disjoint WHERE clauses) |
| Codex #11 residual ("unmaintained" wording) | §5.3: reworded to "maintained by no repo code; prod triggers confirmed by the §2.3 guard"; mechanism re-opens if trigger found |
| Codex N5 residual (service_role ALL permits direct INSERT) | §4.5: direct DML on crawl_jobs revoked; RPCs are the sole write path |
| Codex N8 residual (VALIDATE lock mode, resume path) | §2.4b: VALIDATE uses SHARE UPDATE EXCLUSIVE; NOT-VALID-existing-FK resume path added |
| Codex N11 (signals values untyped) | §4.2: CHECK walks jsonb_each enforcing number-in-[0,1] or bucket-enum per value; no nested objects or free text |

## 11. Round-5 changelog (what v6 changed vs v5)

| Finding | v6 resolution |
|---|---|
| Codex N12 (reservation can land after review input changed) | §4.2: commit_review_verdict RPC atomically verifies reservation pair AND recomputes the live review's current input hash in the same transaction |
| Codex N13 (jsonb_each not usable in CHECK) | §4.2: IMMUTABLE scalar helper `rate.signals_valid(jsonb)` called from the CHECK |
| Codex N14 (price observation key cross-platform collision) | §4.1: observation id scoped to listing `product_id` (UUID), not platform_item_id |
| Codex N15 (verdict write + run lifecycle RPCs missing) | §4.1: full RPC surface listed incl. start_crawl_run/finish_crawl_run; §4.2: commit_review_verdict is the sole write path |
| Codex #11 residual (§6.5 "unmaintained today") | §6.5: reworded to "maintained by no repo code; prod triggers confirmed by the §2.3 guard" |

## 12. Round-6 changelog (what v7 changed vs v6)

| Finding | v7 resolution |
|---|---|
| Codex N12 residual (TOCTOU: snapshot may read stale hash while another tx edits the review) | §4.2: commit_review_verdict takes `SELECT ... FOR UPDATE` on the reviews row and the reservation BEFORE the hash check, holds the lock to commit; READ COMMITTED + lock-before-check closes the window |
| Codex N16 (crawl_runs schema lacks status) | §4.1: status column declared with CHECK ('running'/'finished'/'aborted'), timeout-abort condition specified |
