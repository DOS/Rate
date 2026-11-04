# DOS-Me proposal: extension observation quarantine (M2)

DOS/Rate#1606, milestone M2 of `Docs/Proposals/2026-10-28-extension-data-source.md`. Status:
**proposal, nothing applied.** It goes through DOS-Me after JOY approves it.

| File                                                    | What                                                    |
| ------------------------------------------------------- | ------------------------------------------------------- |
| `2026-11-04-dos-me-extension-observations.sql`          | the migration, one transaction                          |
| `2026-11-04-dos-me-extension-observations-verify.sql`   | read-only checks, V1 to V8 return 0 (V9 is information) |
| `2026-11-04-dos-me-extension-observations-rollback.sql` | drops the functions and both tables                     |
| `scripts/test-extension-observations-proposal.mjs`      | replays it all on PostgreSQL in Docker                  |

## What it does

The extension sends what a shopper's browser shows on a listing: price, list price, stock and
variant. This migration stores those observations in a quarantine. Nothing reads them into
prices, products or ratings. Corroboration and promotion are M3/M4, in DOS/Rate-Services.

- **`rate.extension_submitters`** (new): one row per install that opted in. It holds a random
  id and its creation time, nothing else.
- **`rate.extension_observations`** (new): the quarantine.
  - One column per key of the `ExtensionObservation v1` payload, each with a CHECK that repeats
    the payload rule.
  - `received_at`, set by the server. The server trusts it more than `observed_at`.
  - `network_hash`: the web's HMAC-SHA256 of the sender's /24 or /48, or null.
  - `status`: `quarantined`, `corroborated` or `rejected`.
  - It cascades from its submitter.
  - Indexes on `(submitter_id, received_at)`, `(network_hash, received_at)` and
    `(marketplace, external_item_id, received_at)`.
- **Access.**
  - Row level security is on for both tables.
  - `anon` and `authenticated` have no table privilege; they use the RPCs only.
  - `service_role` has full access.
  - `rate_worker` reads both tables and may update `status` only (a column grant).
- **RPCs.** All four are `SECURITY DEFINER` with `search_path = ''`. EXECUTE is revoked from
  PUBLIC.
  1. `rate.register_extension_submitter()`, for anon, authenticated and service_role.
     - It creates a submitter and returns its id.
     - Over 600 submitters in the last minute, it raises 54000.
  2. `rate.submit_extension_observation(p_submitter_id, p_observation, p_network_hash)`, for
     anon, authenticated and service_role.
     - It checks every payload rule, the host table included.
     - A refusal raises 22023, and DETAIL names the field.
       - The field is a payload key, `extractor.source` or `extractor.extension_version`.
       - An extra key is named by itself. A missing key is named too: every key must be
         present, a nullable one as null.
       - A payload that is not an object, or is over 16 KB, is `observation`.
       - A bad hash is `network_hash`.
     - An unknown submitter raises P0002 with DETAIL `submitter_id`.
     - Over 120 observations per submitter, or 600 per network hash, in the last hour, it
       raises 54000. DETAIL is `submitter_id` or `network_hash`.
     - It returns `{"id", "status": "quarantined", "received_at"}`.
  3. `rate.delete_extension_submitter(p_submitter_id)`, for anon, authenticated and
     service_role.
     - It deletes the submitter, and its observations by cascade.
     - It returns how many observations went. An unknown id returns 0.
  4. `rate.purge_extension_observations(p_network_hash_days, p_keep_days)`, for service_role
     only.
     - Defaults: 28 and 180 days.
     - It clears `network_hash` on older rows, deletes older observations, then deletes old
       submitters left without observations.
     - It returns `{network_hashes_cleared, observations_deleted, submitters_deleted}`.

Marketplace ids are the platform ids of the extension and the crawl: `shopee`, `lazada`, `tiki`,
`tiktok`, `cellphones`, `tgdd`, `fptshop`, `hoangha`, `didongviet`, `phongvu`. The host table:

| marketplace | hosts                            |
| ----------- | -------------------------------- |
| shopee      | shopee.vn                        |
| lazada      | lazada.vn and subdomains         |
| tiki        | tiki.vn                          |
| tiktok      | www.tiktok.com, shop.tiktok.com  |
| cellphones  | cellphones.com.vn                |
| tgdd        | thegioididong.com and subdomains |
| fptshop     | fptshop.com.vn                   |
| hoangha     | hoanghamobile.com                |
| didongviet  | didongviet.vn                    |
| phongvu     | phongvu.vn                       |

A host must be lowercase, with no user and no port.

## Privacy

- **The submitter id is pseudonymous personal data.** It links every observation of one
  install. It holds no account, email or device data.
- **The network hash is pseudonymous personal data too.** It is keyed by a web secret, so the
  database alone cannot reverse it. It is kept only for the network limit and for abuse review.
- **Retention:**
  - `network_hash` is cleared after 28 days;
  - observations are deleted after 180 days;
  - submitters older than 180 days with no observations left are deleted.
  - All three are done by `rate.purge_extension_observations`. It must run daily as
    `service_role`. V9 of the verify file shows rows it should already have handled.
- **Delete on request:** the extension calls the web's `DELETE` route, which calls
  `rate.delete_extension_submitter`. Everything that install sent goes at once.
- **No other personal data:** the payload refuses any other key. It has no ratings, account
  data, cookies, query strings or referrers. A URL with `?` or `#` is refused.

## Order and dependencies

- **Needs:** the `rate` schema, the API roles and `rate_worker`
  (`20261018183000_rate_worker_role.sql`). All are in production.
- **Web:** the routes behind `RATE_EXTENSION_OBSERVATIONS=1` (off by default) call RPCs 1 to 3.
  Turn the flag on only after the apply and the verify.
- **Purge:** schedule it after the apply, daily, as `service_role`. The DOS-Me pg_cron or an
  RS worker job both fit. This migration does not schedule it.
- **After this:** M3/M4 in DOS/Rate-Services read the quarantine as `rate_worker` and set
  `status`.

**Rating impact: none.** Nothing reads these tables into prices, products or ratings.

## Decisions and limits

1. **The limits are coarse.**
   - Without a salt on the web, `network_hash` is null and only the per-submitter limit holds.
     A caller can then register new submitters to get past it, up to the global brake. Set the
     salt before the flag goes on.
   - The register brake is global. A flood of registrations blocks new installs for a minute,
     but not installs that already have an id.
   - Per submitter and per network, calls run one at a time (a row lock and an advisory lock),
     so those counts are exact.
2. **The id is the only key.** Whoever holds a submitter id can send as it or delete it. The id
   is random (122 bits) and stays in the extension's storage.
3. **The CHECKs repeat the payload rules** so that `service_role`'s direct writes keep to them.
   One difference: a CHECK cannot read the clock, so `observed_at` is held to `received_at`
   (10 minutes ahead, 24 hours behind), not to `now()`.
4. **A change to the payload needs a migration.** The SQL repeats the shared zod schema's
   rules. A drift fails closed: the RPC refuses what it does not know.
5. **`extension_submitters_created_idx`** is an extra index, not in the contract. The register
   brake and the purge read `created_at`.

## Apply

1. Copy the `.sql` into DOS-Me `supabase/migrations/` with a new timestamp, and the verify and
   rollback files into `scripts/ops/`.
2. After the beta and production applies, run the verify file read-only as `postgres` or
   `service_role`. V1 to V8 must return 0.
3. **Rollback:** the rollback file, safe to run twice. Turn the web flag off first. Every
   observation and submitter id is lost.

## Tests (local, Docker)

`node scripts/test-extension-observations-proposal.mjs`:

- the proposal applied twice, and V1 to V8;
- a valid observation for every marketplace and host form, and the edges that pass;
- 98 refused payloads, each with 22023 and its field, and the bad hashes;
- every missing key named;
- an unknown or null submitter (P0002), and nothing written by a refused call;
- the 120 an hour limit (with rows older than an hour not counted), the 600 an hour network
  limit, and the register brake;
- delete: the count, the cascade, 0 for an unknown or null id;
- purge: hashes cleared, rows and empty submitters deleted, and service_role only;
- grants: anon and authenticated cannot select, insert, update, delete or truncate either
  table; rate_worker reads and updates `status` only; the CHECKs hold `service_role`;
- the rollback twice, then the proposal again, and again over data.
