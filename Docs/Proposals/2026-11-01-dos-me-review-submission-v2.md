# DOS-Me migration proposal: review submission v2 (P3)

**Not applied.** DOS/Rate#1544, phase P3 of the criteria ratings design (`2026-10-31-criteria-stars-pros-cons.html`, sections 2 and 4.2; D1 and D5, approved by JOY on 2026-10-31). JOY reviews it and applies it through DOS-Me: preview, then beta, then production. DOS/Rate runs no DDL against production.

- **Needs:** P2 (`2026-10-31-dos-me-criteria-ratings.sql`, DOS/DOS.Me#1489) applied first. P3 writes P2's columns (`rating_exact`, `verdict`, `criteria_version`) and P2's `rate.review_points` table.
- **Files:**
  - `2026-11-01-dos-me-review-submission-v2.sql`: the migration, one transaction, re-runnable.
  - `-verify.sql`: read-only checks; V1 to V6 must return 0.
  - `-rollback.sql`: drops what the migration adds, one transaction, re-runnable.
- **Replay test:** `scripts/test-review-submission-v2-proposal.mjs`, on Docker, in DOS/Rate CI.

## What it adds

- **`rate.rating_criteria`:** the criteria of each category, with weight, the required flag and order, versioned. Version 1 is `packages/shared-data/src/rules/rating-criteria.ts`, 36 rows. A version never changes; a new list is a new version. RLS is on, with public read.
- **Line helpers**, the SQL side of `review-form.ts`:
  - `rate.review_point_compare` (`comparablePoint`): lower case, diacritics kept, punctuation as spaces;
  - `rate.review_point_has_content` (`hasContent`);
  - `rate.review_point_is_evasive_con` (`isEvasiveCon`); its pattern is `EVASIVE_CON_PATTERN`, character for character;
  - `rate.review_text_length`;
  - `rate.review_point_list`, which checks one list of pros or cons.
- **`rate.submit_community_review_v2(master, criteria, verdict, pros, cons, criterion_points, comment, author_name, variation, reviewer_type)`**, SECURITY DEFINER, callable by `authenticated` and `service_role`. It:
  - checks the criterion stars: keys of the master's category only, 1 to 5 in half steps, the required criterion given, at most 2 left out;
  - stores `rating_exact` as their weighted average at 0.1 (the same as `weightedReviewStar`), and `rating_star` as that value rounded;
  - checks the verdict: 20 to 300 characters, with words in it;
  - checks pros and cons: 1 to 5 each, 5 to 150 characters each, no line twice, no line in both lists, and no con that dodges;
  - checks the lines of one criterion: up to 3 pros and 3 cons, under the same rules;
  - writes the review, one `rate.review_points` row per line, the author row and the excluded flag, all in one transaction. A refused call writes nothing.
  - Without free text, the verdict becomes the review's `comment`, so the analyzer and v1 readers still have text.
- **`review_points_position_key`:** one row per review, criterion, kind and position.

## Same as v1

- Only a signed-in, non-anonymous user or the service role can submit.
- The review goes on a crawled listing of the master.
- One review per user and master, and at most 5 reviews per user in 24 hours. v1 and v2 share the per-user lock.
- The keyword rules apply, now over the verdict and the lines too. They only exclude.
- A new review starts excluded until the analyzer decides.

v1 stays unchanged and granted, so the current form works until the web calls v2. A later migration revokes v1.

## Errors

- Messages are in Vietnamese, with SQLSTATE 22023.
- The field is in `DETAIL`, so the API can mark it:
  - `criteria`, or `criteria.<key>`;
  - `verdict`;
  - `pros`, or `pros.<i>`;
  - `cons`, or `cons.<i>`;
  - `criterion_points.<key>.<pros|cons>.<i>`;
  - `comment`.
- The gates keep v1's codes:
  - 42501: not signed in, or an anonymous account;
  - 23505: the user already reviewed this master;
  - 54000: more than 5 reviews in 24 hours;
  - P0002: no product, or no listing.

## Differences from the TypeScript rules

- `review_point_compare` turns everything but letters, digits and spaces into a space. `comparablePoint` turns only punctuation and symbols into a space. The two differ only on control characters and combining marks left after composition.
- The replay test checks both on a corpus of real and tricky lines: diacritics, dodges, fullwidth letters, zero-width spaces and emoji.

## Rollout

1. Preview: Supabase Preview applies it on the DOS-Me PR. Then run the verify file there, read-only.
2. Beta: the native GitHub Integration applies it on merge to `dev`. Then run the verify file.
3. Production: a selective promote PR into `main`, after JOY's approval, as for P2.
4. Web (P3, #1544): the form and `POST /api/v1/rate/reviews` call v2, and map `DETAIL` to the field.
5. Rollback: `-rollback.sql`, only while no web build calls v2. Reviews written through v2 keep their columns and lines.

## Verification

- **V1:** 36 version 1 rows; each category weighs 100, with one required criterion.
- **V2:** the six functions exist; the RPC is SECURITY DEFINER with an empty `search_path`.
- **V3:** `anon` cannot run the RPC; `authenticated` and `service_role` can.
- **V4:** every v2 review has a verdict, a 0.1 star, a pro and a con.
- **V5:** every v2 review's star equals its 0.1 star rounded.
- **V6:** the position key exists.
- **V7** (for information): the number of v2 reviews and lines.
