# DOS-Me proposal: extension observation quarantine (M2)

DOS/Rate#1606, milestone M2 of `Docs/Proposals/2026-10-28-extension-data-source.md`, with the
contract's Revision 2 (after four reviews). Status: **proposal, nothing applied.** It goes
through DOS-Me after JOY approves it.

| File                                                    | What                                                      |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `2026-11-04-dos-me-extension-observations.sql`          | the migration, one transaction                            |
| `2026-11-04-dos-me-extension-observations-verify.sql`   | read-only checks, V1 to V12 return 0 (V13 is information) |
| `2026-11-04-dos-me-extension-observations-rollback.sql` | drops the functions and the three tables                  |
| `scripts/test-extension-observations-proposal.mjs`      | replays it all on PostgreSQL in Docker                    |

## What it does

The extension sends what a shopper's browser shows on a listing: price, list price, stock and
variant. This migration stores those observations in a quarantine. Nothing reads them into
prices, products or ratings. Corroboration and promotion are M3/M4, in DOS/Rate-Services.

- **`rate.extension_ingest_secret`** (new): one private row, the sha256 of the web's secret
  `RATE_EXTENSION_INGEST_KEY`.
  - The migration inserts no row. DOS-Me sets it at apply time. The key itself is never in git.
  - Only `service_role` has access.
- **`rate.extension_submitters`** (new): one row per install that opted in. It holds a random
  id, its creation time and the network hash it registered from.
- **`rate.extension_observations`** (new): the quarantine.
  - One column per key of the `ExtensionObservation v1` payload, each with a CHECK that repeats
    the payload rule.
  - `received_at`, set by the server. The server trusts it more than `observed_at`.
  - `network_hash`: the web's HMAC-SHA256 of the sender's /24 or /48.
  - `status`: `quarantined`, `corroborated` or `rejected`.
  - It cascades from its submitter.
- **Access.**
  - Row level security is on for the three tables, and not forced.
  - `anon` and `authenticated` have no table privilege; they use the RPCs only.
  - `service_role` has full access.
  - `rate_worker` reads submitters and observations and may update `status` only (a column
    grant). It has nothing on the ingest key.
- **RPCs.** All four are `SECURITY DEFINER` with `search_path = ''`, owned by the tables' owner.
  EXECUTE is revoked from PUBLIC.
  1. `rate.register_extension_submitter(p_ingest_key, p_network_hash)`, for anon,
     authenticated and service_role.
     - A key that is missing, shorter than 32 characters, or whose sha256 is not the stored row
       raises 42501, DETAIL `ingest_key`. Without a row, every call is refused. The row can
       never hold the sha256 of the empty string (a CHECK).
     - A network hash that is not 64 lowercase hex characters raises 22023, DETAIL
       `network_hash`.
     - Over 20 new submitters per network hash in the last hour raises 54000, DETAIL
       `network_hash`.
     - Over 600 new submitters in the last minute, in all, raises 54000, DETAIL `submitter`.
     - Each count runs under an advisory lock, so it is exact.
  2. `rate.submit_extension_observation(...)`, for anon, authenticated and service_role. Its
     arguments: `p_ingest_key`, `p_submitter_id`, `p_observation`, `p_network_hash`.
     - The ingest key and the network hash are checked as in register.
     - Then every payload rule, in the order of the shared validator. A refusal raises 22023,
       and DETAIL names the field:
       - `observation` for a payload that is not an object, is over 16 KB, or has another key.
         A caller's key name is never echoed.
       - then each key in turn, its presence checked with its rule; a nullable key must be
         present as null;
       - then `extractor.source` and `extractor.extension_version`.
     - An unknown submitter raises P0002 with DETAIL `submitter_id`.
     - Over 120 observations per submitter, or 600 per network hash, in the last hour, it
       raises 54000. DETAIL is `submitter_id` or `network_hash`.
     - It returns `{"id", "status": "quarantined", "received_at"}`.
  3. `rate.delete_extension_submitter(p_submitter_id)`, for anon, authenticated and
     service_role.
     - It takes no ingest key, so erasure always works.
     - It deletes the submitter, and its observations by cascade.
     - It returns how many observations went. An unknown id returns 0.
  4. `rate.purge_extension_observations(...)`, for service_role only. Its arguments:
     `p_network_hash_days` (28), `p_keep_days` (180), `p_empty_submitter_days` (7).
     - It clears `network_hash` on older submitters, then on older observations. That order
       matches delete (the submitter, then its observations), so a delete during a purge waits
       instead of deadlocking.
     - It deletes older observations.
     - It deletes submitters without observations that are older than
       `p_empty_submitter_days`.
       - It locks them first, skipping any a submit holds, then deletes them under a fresh
         check.
       - So an observation committed during the purge is never cascaded away.
     - It returns the four counts.

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

A listing URL is https, at most 2048 characters. It has no `?`, `#` or `;`, no space and no
control character. Its host is lowercase, with no user and no port.

## The ingest key

- Without the key, a caller holding only the public anon key can no longer call register or
  submit. So nobody can bypass the web: its flag, its validator, its salt and the network
  limit.
- The network hash is therefore always the web's. It is evidence of independence only for rows
  written through the web, and with the key in place that means all rows.
- The key is a server secret of the web. It must never be committed. Its sha256 may be.
- **Rotation is a hard cut.** Once the new row is set, register and submit answer 42501 to the
  old key, so the web's writes fail (503) until it redeploys with the new key. Deletes keep
  working.

## Privacy

- **The submitter id is pseudonymous personal data.** It links every observation of one
  install. It holds no account, email or device data.
- **The network hash is pseudonymous personal data too.** It is keyed by a web secret, so the
  database alone cannot reverse it. It is kept for the limits and for abuse review.
- **Retention:**
  - `network_hash` is cleared after 28 days, on observations and on submitters;
  - observations are deleted after 180 days;
  - submitters without observations are deleted after 7 days.
  - All three are done by `rate.purge_extension_observations`. It still needs a daily job as
    `service_role`: the DOS-Me pg_cron or an RS worker. V13 of the verify file shows rows it
    should already have handled.
- **Delete on request:** the extension calls the web's `DELETE` route, which calls
  `rate.delete_extension_submitter`. Everything that install sent goes at once.
- **No other personal data:** the payload refuses any other key. It has no ratings, account
  data, cookies, query strings or referrers.

## Order and dependencies

- **Needs:** the `rate` schema, the API roles and `rate_worker`
  (`20261018183000_rate_worker_role.sql`). All are in production.
- **Shared validator:** the replay compares the RPC with `parseExtensionObservationV1` in
  `packages/shared-data/src/rules/extension-observation.ts`. That code PR merges first.
- **Web:** the routes behind `RATE_EXTENSION_OBSERVATIONS=1` (off by default) call RPCs 1 to 3
  with the ingest key. Turn the flag on only after the apply, the key row and the verify.
- **After this:** M3/M4 in DOS/Rate-Services read the quarantine as `rate_worker` and set
  `status`.

**Rating impact: none.** Nothing reads these tables into prices, products or ratings.

## Decisions and limits

1. **The limits are coarse.**
   - The register brake of 600 a minute is global. A flood of registrations from many networks
     blocks new installs for a minute, but not installs that already have an id.
   - Per submitter, per network and in all, calls run one at a time (a row lock and advisory
     locks), so the counts are exact.
2. **The submitter id is the only key to its data.** Whoever holds an id can delete it. The id
   is random (122 bits) and stays in the extension's storage.
3. **The CHECKs repeat the payload rules** so that `service_role`'s direct writes keep to them.
   One difference: a CHECK cannot read the clock, so `observed_at` is held to `received_at`
   (10 minutes ahead, 24 hours behind), not to `now()`.
4. **A change to the payload needs a migration.** The SQL repeats the rules of the shared
   validator, which is plain functions. A drift fails closed, and the replay compares both
   over 167 payloads.
   - `observed_at` takes seconds 00 to 59 (no leap second) and an offset up to 15:59, which is
     what Postgres parses.
5. **Where the RPC and the validator differ on purpose:**
   - the 16 KB cap is the RPC's alone (the web caps the request body);
   - a lone UTF-16 surrogate: the validator names the field, and jsonb refuses the text
     itself (22P02).
6. **Two indexes are not in the contract:** `extension_submitters_created_idx` and
   `extension_submitters_network_created_idx`, for the register limits and the purge.

## Apply

These steps are for the session or agent that applies DOS-Me. JOY runs no command.

1. **Generate the key** with a CSPRNG, for example `openssl rand -hex 32`. Keep it out of git,
   logs and chat.
2. **Hash the exact bytes** with `printf %s "$KEY" | sha256sum`.
   - Never `echo`, which adds a newline.
   - Never in SQL, where the key would reach the database logs.
   - Check that `$KEY` is set: the sha256 of an empty key is refused by a CHECK.
3. **Set the web's secrets** on every Vercel environment that points at that database:
   - `RATE_EXTENSION_INGEST_KEY`: the key;
   - `RATE_NETWORK_HASH_SALT`: random, at least 16 characters.
   - Preview, beta and production share the prod database, so they share one key.
4. **Apply the migration.** Copy the `.sql` into DOS-Me `supabase/migrations/` with a new
   timestamp, and the verify and rollback files into `scripts/ops/`.
5. **Insert the row**, as `postgres` or `service_role`, with only the hash:

   ```sql
   INSERT INTO rate.extension_ingest_secret (key_sha256) VALUES ('<sha256 hex>')
   ON CONFLICT (id) DO UPDATE SET key_sha256 = EXCLUDED.key_sha256, updated_at = now();
   ```

6. **Run the verify file** read-only. V1 to V12 must return 0; V12 proves the row is set.
7. **Only then turn the web flag on** (`RATE_EXTENSION_OBSERVATIONS=1`).
8. Schedule the daily purge as `service_role`.

**Rollback:** the rollback file, safe to run twice. Turn the web flag off first. Every
observation and submitter id is lost, and the key row with them.

## Tests (local, Docker)

`pnpm --filter @repo/shared-data build && node scripts/test-extension-observations-proposal.mjs`:

- the proposal applied twice, and V1 to V12; V1, V2 and V11 fail on a forced RLS or a stray
  grant;
- the ingest key: no row, a wrong, empty or null key, and the hash itself are refused (42501);
  a 31-character key is refused even when its hash is stored; the empty key's hash cannot be
  stored; the right key passes; the table holds one row;
- a required network hash in register and submit;
- 39 valid and 128 refused payloads, each with the same verdict and field from the RPC and from
  `parseExtensionObservationV1`, URL and time edges included;
- an unknown or null submitter (P0002), and nothing written by a refused call;
- the limits at their exact thresholds: the 120th per submitter, the 600th per network (with
  100 older rows), the 20th register per network and the 600th register in a minute pass; the
  next one is refused;
- delete: the count, the cascade, 0 for an unknown or null id, no key needed;
- purge: hashes cleared on both tables, rows and empty submitters deleted, service_role only;
  a submit held open during the purge keeps its submitter and its row; and a delete in the
  middle of a stalled purge waits for it instead of deadlocking (the old lock order fails this
  test with "deadlock detected");
- grants: anon and authenticated reach none of the three tables; rate_worker reads and updates
  `status` only and has nothing on the key; the CHECKs hold `service_role`;
- the rollback twice, then the proposal again (refusing until the key row is set), and again
  over data.
