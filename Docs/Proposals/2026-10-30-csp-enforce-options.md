# Decision: how to enforce the CSP `script-src` (DOS/Rate#1323, #1348)

**Status:** proposal for JOY. Nothing is applied, and the CSP stays report-only until JOY decides. Vietnamese version for JOY: [`2026-10-30-csp-enforce-options.html`](./2026-10-30-csp-enforce-options.html).

## Where we are

- The proxy (`apps/web/src/proxy.ts`) sends a strict policy as `Content-Security-Policy-Report-Only` with a fresh nonce on every request: `script-src 'self' 'nonce-…' 'strict-dynamic'` (`apps/web/src/lib/csp.ts`).
- The enforced parts today are only `frame-ancestors`, `base-uri`, `form-action` and `object-src`. Pages get these through a `<meta>` tag (`PAGE_META_CSP`) and `X-Frame-Options`, not through a header. An enforcing CSP header would be copied onto the request, and Next.js would then read the nonce from it (#1345).
- Since #1345, pages that render per request carry the nonce. Checked live on 2026-10-30 (read-only GETs): `/smartphones` and `/inspect` (`MISS`) had 27 to 29 `nonce=` attributes matching the header.
- ISR pages are rendered once and served from the cache. Their HTML has no nonce (`"nonce":"$undefined"` in the RSC payload). `/` (`HIT`/`STALE`) had 9 inline scripts and 0 nonces. The ISR routes are: home, about-us, contact-us, developers, deals, leaderboard, merchants, merchants/[id], compare/[versus], watchlist, and the five product routes `[category]/[slug]`.

## What the live reports say

Source: `vercel logs --scope metados --project rate -e production --since 12h --query 'csp violation'`, read-only, 2026-10-29 18:54 to 2026-10-30 05:56 UTC. The Pro plan keeps runtime logs for about 12 hours, so the window cannot be longer. `/api/csp-report` logs each distinct violation once per 10 minutes per instance, so these are distinct lines, not page views.

| | lines |
|---|---|
| total | 2392 |
| `script-src-elem`, blocked = a `/_next/static` chunk | 2020 |
| `script-src-elem`, blocked = `inline` | 372 |
| any other directive (`img`, `connect`, `style`, `frame`, …) | **0** |
| any third-party script host | **0** (69 lines name chunks on `rate-*.vercel.app` deployment URLs) |

By deployment:
- The deployment before the #1345 fix (`…A4WvVq`, until 04:19) reported every page, dynamic pages included: `/smartphones` 428, `/` 423, product 269, `/leaderboard` 230, `/merchants/[id]` 219, `/compare` 197 and so on.
- The current deployment (`…2U8rmf`, from 05:43) reported only ISR pages: `/` 219, `/merchants/[id]` 76, product 66, `/contact-us` 27. That window was short (13 minutes), but no dynamic page appears in it.

Reading:
- Every report so far is Rate's own Next.js scripts on cached pages: the inline RSC payload (`self.__next_f.push`), and the chunks it loads. Under `'strict-dynamic'`, `'self'` is ignored, so a chunk is allowed only when a nonced script loads it.
- No extension, third-party or analytics script has been reported, and nothing outside `script-src`. Enforcing the strict policy today would break every ISR page and nothing else.

## Options

### (a) Nonce everywhere, with ISR pages rendered per request

- **How:** make the ISR routes dynamic (drop `revalidate`, or read `headers()`), so each response carries its own nonce, then enforce the strict policy.
- **Protection:** the strongest. No inline script runs without the nonce.
- **Cost, measured with the #1344 numbers:**
  - A cold product render was **12.3 s TTFB**: 7.1 s in reads (offers 2.7 s, competitorOffers 2.7 s, reviews 2.3 s) and about 5 s outside them. A cold merchant render was **14.9 s**. PR #1416 runs the reads side by side, but the post-promote number is not in yet, and the 2 s target is not met.
  - Warm, the cached ISR pages answer in **0.2 to 0.5 s** (`HIT`). The warm dynamic `/smartphones`, with its data cache warm, answered in **0.6 to 0.7 s**. Same network, 3 requests each, 2026-10-30.
  - With (a), every view of every product, merchant and versus page becomes a function invocation. Each view that lands on a cold instance or an expired data cache pays the multi-second render that ISR hides today. Function cost and Supabase load grow with traffic instead of with the number of pages.
- **Verdict:** not now. It trades a protection that has no reported attacker for a slower site that users feel. Revisit once #1344 brings a cold render under 2 s.

### (b) Hashes instead of a nonce (Next.js `experimental.sri`, or a manual hash list)

- **How:** `experimental: { sri: { algorithm: 'sha256' } }` gives every `/_next/static` chunk an `integrity` attribute. Next.js 16.4 supports it with Turbopack builds too (`build/turbopack-build/impl.js`). The policy would then list hashes instead of a nonce.
- **What breaks:**
  - **The inline RSC payload.** Each page has several inline `self.__next_f.push(…)` scripts. Their content is the page's own data, different on every page and on every regeneration. Their hashes cannot go in a header set before the render (the proxy runs before the page). Nor can they go in a `<meta>` CSP, because the payload scripts are streamed after `<head>`.
  - **`'unsafe-inline'` as a fallback does not help.** Once any hash or nonce is in `script-src`, CSP2+ browsers ignore `'unsafe-inline'`, so the payload scripts would be blocked.
  - **External scripts matched by hash.** A hash only matches an external script through its `integrity` attribute, a CSP3 feature whose browser support is uneven. The hash list would also change on every build, so the policy would have to be generated per build and kept in step with deployments and rollbacks.
- **Maintenance:** a build step that writes the hash list, a test that keeps it in step with the chunks, and no way to cover the inline payload. A manual list is the same, by hand.
- **Verdict:** not viable for App Router pages on its own. SRI is still worth keeping in mind as a separate hardening of chunk integrity.

### (c) Stay report-only, plus a data-driven allowlist that is enforced

- **How:** enforce what the reports show to be safe, and keep the strict nonce policy report-only.
  1. Enforce `script-src 'self' 'unsafe-inline'` on every page, with no `'unsafe-eval'` and no other host. It goes in the existing `<meta>` policy (`PAGE_META_CSP`), not a header, so the nonce hand-off from #1345 is untouched.
     - This blocks a script from any other host (the usual exfiltration or injection payload), `eval`, and plugins. It does not block an injected inline script.
     - It would have produced **0** of the 2392 reports, because every blocked script was Rate's own, inline or under `/_next/static`.
  2. Keep the strict nonce policy report-only, so the reports still show any new script source. Optionally send it only on dynamic pages, so the known ISR noise (about 2400 lines in 12 h) stops hiding new signals.
  3. When #1344 makes per-request rendering cheap, move pages to (a) one route at a time.
- **Where the `<meta>` sits:** a `<meta>` CSP applies only to what the browser parses after it. On the live home page, 16 `<script>` tags in `<head>` come before the meta. All of them are Next.js's own chunks under `/_next/static`, which the policy allows anyway. Everything in `<body>` comes after the meta, and that is where injected markup would land. So the meta covers what matters. An e2e check that the main routes load with no violation goes with the change.
  - Moving the policy to the proxy's response header would cover the head too, but it needs a nonce-reading fix first, because Next.js reads the nonce from the enforcing header (#1345).
- **Verdict:** recommended now. It enforces the part that costs nothing, keeps today's speed, and keeps the strict policy watching.

## Recommendation

1. **Take (c) now.** Add `script-src 'self' 'unsafe-inline'` to the enforced `<meta>` policy, together with an e2e "no violation" check on the main routes. Keep the strict nonce policy report-only.
2. **Keep (a) as the target, gated on #1344.** Move routes to per-request rendering only when a cold render is under 2 s, starting with the lightest ones (about-us, contact-us, developers).
3. **Drop (b)** as the enforcement path. Consider `experimental.sri` later, only as chunk integrity.
4. **Re-scope #1348** to step 1. Keep #1323 open for step 2.

## Decisions for JOY

1. **Inline scripts on cached pages:** accept `'unsafe-inline'` in the enforced policy for now? CSP would then block injected scripts from other hosts and `eval`, but not an injected inline script. Against that, React's output escaping stays the defense, as it is today.
2. **Per-request rendering (a):** defer until #1344 is under 2 s, and accept that the strict policy stays report-only on ISR pages until then?
3. **Report noise:** send the report-only strict policy on dynamic pages only, so the reports show new script sources, not the known ISR violations? Or keep it on every page?
4. **Log retention:** the Pro plan keeps runtime logs for about 12 hours, too short to read a "clean report window" of days. Keep it so (we read the reports in 12-hour windows), or add a log drain? A log drain is an infra and cost decision.
