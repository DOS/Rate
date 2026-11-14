# DOS-Me Migration Proposal: `rate.product_verdicts` (`DOS/Rate#1623`)

- **Date:** 2026-11-14
- **Issue:** `DOS/Rate#1623` (Refs `#1531`, design section 5.2)
- **Target Ledger:** `DOS-Me/supabase/migrations/` (`preview -> beta -> prod`)
- **Status:** Proposal only (not applied from `DOS/Rate` per `AGENTS.md` 0.1)

## Context

`rate.product_points` restricts `kind IN ('pro', 'con')` and `char_length(btrim(label)) BETWEEN 3 AND 200`, so it cannot store the 1-2 sentence product verdict ending `"Tóm tắt từ <N> review"`. Meanwhile `rate_worker` intentionally holds no `UPDATE` privilege on `rate.master_products`.

## Proposed Schema (`rate.product_verdicts`)

A dedicated `1:1` table keyed by `master_id` keeps `rate_worker` isolated from `rate.master_products` while letting web Server Components read the precomputed verdict alongside `rate.product_points` with zero AI calls on page load:

- `master_id uuid PRIMARY KEY REFERENCES rate.master_products(id) ON DELETE CASCADE`
- `verdict text NOT NULL CHECK (char_length(btrim(verdict)) BETWEEN 10 AND 500)`
- `review_count integer NOT NULL CHECK (review_count > 0)`
- `method text NOT NULL DEFAULT 'ai' CHECK (method IN ('code', 'ai'))`
- `updated_at timestamptz NOT NULL DEFAULT now()`

## Privileges & RLS

- `RLS` enabled on `rate.product_verdicts`.
- `anon, authenticated`: `SELECT` only (`USING (true)`).
- `rate_worker`: `SELECT, INSERT, UPDATE, DELETE` (`USING (true) WITH CHECK (true)`), matching `rate.product_points`.
- `service_role`: `ALL`.

## Optional Atomic Replacement RPC (`rate.replace_product_points_ai`)

Until this `DOS-Me` migration lands, `product-points-ai.ts` inserts the new `method = 'ai'` rows returning their UUIDs and sweeps every `method = 'ai'` row for that `master_id` not in the newly inserted set (preventing overlapping runs from leaving duplicate AI sets). When deploying `rate.product_verdicts` in `DOS-Me`, we can optionally bundle a `rate.replace_product_points_ai(p_master_id uuid, p_points jsonb, p_verdict text, p_review_count int)` `SECURITY INVOKER` RPC to replace both `rate.product_points` (`method = 'ai'`) and `rate.product_verdicts` under a single per-master transaction lock.

## Companion Files

- Migration: `Docs/Proposals/2026-11-14-dos-me-product-verdict.sql`
- Verification (`V1`-`V4` all return `0`): `Docs/Proposals/2026-11-14-dos-me-product-verdict-verify.sql`
- Rollback: `Docs/Proposals/2026-11-14-dos-me-product-verdict-rollback.sql`
