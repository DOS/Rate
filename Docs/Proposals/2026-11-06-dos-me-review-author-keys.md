# Per-review author key (DOS/Rate#1614)

Status: **proposal, nothing applied.** The migration goes to DOS-Me; DOS/Rate never applies it.

Rate-Services (DOS/Rate-Services#1073) masks `rate.reviews.author_name` and redacts contact data
before the engine inserts reviews. The analyzer told authors apart by `author_name` for the
duplicate-text and seeding checks, so masked names would merge many real authors. RS therefore
sends a key per review and the analyzer groups by it.

## Ingest contract (what RS sends)

On each review of a `ScrapedProduct` (`reviews[]`):

| Field       | Type   | Rule                                                                            |
| ----------- | ------ | ------------------------------------------------------------------------------- |
| `authorKey` | string | optional; 16 to 128 chars of `[A-Za-z0-9_-]`, else dropped (the review is kept) |

- Recommended value: hex of `HMAC-SHA256(secret, normalised original author name)` (64 chars).
  The secret stays in RS; Rate never sees it. Use one secret for all products and platforms so
  the same author keeps one key. Not reversible.
- The key is compared exactly (case-sensitive). Keep the normalisation in RS stable (for example
  NFC, trimmed, lower-cased) so one author gets one key.
- Absent key: the analyzer groups by `author_name` as before. Old rows keep working.
- `author_name` is stored and shown as sent (masked or not). No UI change.

## Storage

`rate.review_author_keys (review_id, author_key, created_at)`, not a column on `rate.reviews`:
anon has a table-level SELECT on `rate.reviews`, and a stable key would let anyone link one
author's reviews across products. The new table is readable only by `service_role` and
`rate_worker`. The importer upserts a row per keyed review after inserting the reviews (also for
reviews already stored, so a later crawl backfills) and reads them for the analysis. A write or
read failure logs a warning and the analysis falls back to `author_name`.

## Analyzer

`reviewAuthorIdentity` (apps/importer `ai-review-analyzer.ts`): `key:<author_key>` when present,
else `name:<lower-cased author_name>`, else `id:<review id>`. Duplicate-text counts and the
near-duplicate shingle pass use it. Scoring weights are unchanged.

Limits: reviews stored before masking carry a raw name and get a key only when crawled again;
until then they are one identity by name and a keyed copy of the same author counts as another.
Unkeyed masked names ("N***n") can merge different authors. RS should send a key on every review.
Do not rotate the HMAC secret or change the name normalisation: a crawl returns only a window of
recent reviews, so old and new keys of one author would meet in one analysis and count as two
authors. A change needs a full re-send of every review first.
The worker role can write keys only for crawled reviews (not `origin = 'community'`).
Also: `rate.review_input_hash` includes `author_name`, so masking changes that hash (RS/DB side; the crawl path does not use it).

## Files

| File                                                | What                      |
| --------------------------------------------------- | ------------------------- |
| `2026-11-06-dos-me-review-author-keys.sql`          | the migration             |
| `2026-11-06-dos-me-review-author-keys-verify.sql`   | read-only checks V1 to V4 |
| `2026-11-06-dos-me-review-author-keys-rollback.sql` | drops the table           |
