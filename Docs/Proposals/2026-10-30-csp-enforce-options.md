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

Reading, and its limits:
- Every blocked URL is a Next.js chunk of this site or of a deployment URL that served the page itself. The 69 `rate-*.vercel.app` lines came from pages on those deployment URLs. The rest are inline scripts.
- The endpoint does not keep a script sample, so "inline" cannot be matched to the RSC payload (`self.__next_f.push`) line by line. The payload is the likely source, because the ISR HTML holds 9 inline scripts and no nonce.
- Under `'strict-dynamic'`, `'self'` is ignored, so a chunk is allowed only when a nonced script loads it. On the old deployment, before #1345, no page carried the nonce, so dynamic pages were reported too. On the current one, only ISR pages are.
- The endpoint keeps at most 200 distinct keys per instance per 10 minutes, and the window is 12 hours. So "0 other violations" means none were logged, not that none can exist.
- **What this data cannot show:** under `'strict-dynamic'`, a script that a trusted script inserts may load from any host without a report. A third-party host that the app loads that way would be allowed by today's policy and blocked by option (c). The reports therefore cannot by themselves prove (c) safe. (c) has to be measured as its own policy first (see below).

## Options

### (a) Nonce everywhere, with ISR pages rendered per request

- **How:** make the ISR routes dynamic, so each response carries its own nonce, then enforce the strict policy. Dropping a page's `revalidate` is not enough, because the `[locale]` layout sets `revalidate = 86400`. Each route needs a dynamic API (`headers()`, `connection()`) or `dynamic = 'force-dynamic'`, as the category pages already have (#491).
- **Protection:** the strongest. No inline script runs without the nonce.
- **Cost, measured with the #1344 numbers:**
  - A cold product render was **12.3 s TTFB**: 7.1 s in reads (offers 2.7 s, competitorOffers 2.7 s, reviews 2.3 s) and about 5 s outside them. A cold merchant render was **14.9 s**. PR #1416 runs the reads side by side, but the post-promote number is not in yet, and the 2 s target is not met.
  - Warm, the cached ISR pages answer in **0.2 to 0.5 s** (`HIT`). The warm dynamic `/smartphones`, with its data cache warm, answered in **0.6 to 0.7 s**. Same network, 3 requests each, 2026-10-30.
  - With (a), every view of every product, merchant and versus page becomes a function invocation and a render. The reads stay behind the cross-request data cache (`withRateDataCache`, `server/rate/cache-tags.ts`), so Supabase is hit only on a data-cache miss, not on every view. Function time does grow with traffic instead of with the number of pages. Each view that lands on a cold instance, or on an expired data cache, pays the multi-second render that ISR hides today.
- **Verdict:** not now. It trades a protection that has no reported attacker for a slower site that users feel. Revisit once #1344 brings a cold render under 2 s.

### (b) Hashes instead of a nonce (Next.js `experimental.sri`, or a manual hash list)

- **How:** `experimental: { sri: { algorithm: 'sha256' } }` gives every `/_next/static` chunk an `integrity` attribute. Next.js 16.4 supports it with Turbopack builds too (`build/turbopack-build/impl.js`). The policy would then list hashes instead of a nonce.
- **What breaks:**
  - **The inline RSC payload.** Each page has several inline `self.__next_f.push(…)` scripts. Their content is the page's own data, different on every page and on every regeneration. Their hashes cannot go in a header set before the render, because the proxy runs before the page. A `<meta>` CSP could hold them, since it covers the scripts after it. But `<head>` is sent before the payload is known, so this needs a pipeline of its own: buffer each render and regeneration, hash its inline scripts, and write the meta into the cached HTML. Next.js has no hook for that.
  - **`'unsafe-inline'` as a fallback does not help.** Once any hash or nonce is in `script-src`, CSP2+ browsers ignore `'unsafe-inline'`, so the payload scripts would be blocked.
  - **External scripts matched by hash.** A hash only matches an external script through its `integrity` attribute, a CSP3 feature whose browser support is uneven. The hash list would also change on every build, so the policy would have to be generated per build and kept in step with deployments and rollbacks.
- **Maintenance:** a build step that writes the hash list, a test that keeps it in step with the chunks, and an HTML post-processing step for the inline payload. A manual list is the same, by hand.
- **Verdict:** not viable for App Router pages on its own. SRI is still worth keeping in mind as a separate hardening of chunk integrity.

### (c) Stay report-only, plus a data-driven allowlist that is enforced

- **How:** enforce what the reports show to be safe, and keep the strict nonce policy report-only.
  1. **Measure it first.** Send the policy below as a second report-only policy for a few 12-hour windows, next to the strict one. Send both policies in one report-only header, comma-joined, with the strict nonce policy first and each one with its own `report-uri`. Next.js 16.4 (`get-script-nonce-from-header`) splits that header on `;` and takes the first `script-src`, so with (c) first it would find no nonce. Then check that `/smartphones` still carries the nonce. Also check the preview deployments, where the Vercel toolbar loads scripts from `vercel.live`.
  2. Then enforce `script-src 'self' 'unsafe-inline'` and `worker-src 'self' blob:` on every page, with no `'unsafe-eval'` and no other host. Without `worker-src`, workers fall back to `script-src` and a `blob:` worker would be blocked, for example Sentry Replay (`instrumentation-client.ts`) once its DSN is set. `next dev` keeps `'unsafe-eval'` for React Refresh, as `buildContentSecurityPolicy` does.
     - It goes in the existing `<meta>` policy (`PAGE_META_CSP`), not a header, so the nonce hand-off from #1345 is untouched. Next.js does not read a nonce from a `<meta>` tag.
     - This blocks a script from any other host (the usual exfiltration or injection payload), `eval`, and plugins. It does not block an injected inline script.
     - None of the 2392 logged reports would have been a violation under it: every blocked script was the page's own, inline or under `/_next/static`. Step 1 is still needed, for the reason in the data section.
  3. Keep the strict nonce policy report-only, so the reports still show new script sources. Optionally send it only on dynamic pages, so the known ISR noise (about 2400 lines in 12 h) stops hiding new signals.
  4. When #1344 makes per-request rendering cheap, move pages to (a) one route at a time.
- **Where the `<meta>` sits:** a `<meta>` CSP applies only to what the browser parses after it. On the live home page, 16 `<script>` tags in `<head>` come before the meta. All of them are Next.js's own chunks under `/_next/static`, which the policy allows anyway. Everything in `<body>` comes after the meta, and that is where injected markup would land. So the meta covers what matters. An e2e check that the main routes load with no violation goes with the change.
  - Moving the policy to the proxy's response header would cover the head too, but it needs a nonce-reading fix first, because Next.js reads the nonce from the enforcing header (#1345).
- **Verdict:** recommended now. It enforces the part that costs nothing, keeps today's speed, and keeps the strict policy watching.

## Recommendation

1. **Take (c) now.** Run its policy report-only first, for a few 12-hour windows. Then add `script-src 'self' 'unsafe-inline'; worker-src 'self' blob:` to the enforced `<meta>` policy, together with an e2e "no violation" check on the main routes. Keep the strict nonce policy report-only.
2. **Keep (a) as the target, gated on #1344.** Move routes to per-request rendering only when a cold render is under 2 s, starting with the lightest ones (about-us, contact-us, developers).
3. **Drop (b)** as the enforcement path. Consider `experimental.sri` later, only as chunk integrity.
4. **Re-scope #1348** to step 1. Keep #1323 open for step 2.

## Decisions for JOY

1. **Inline scripts on cached pages:** accept `'unsafe-inline'` in the enforced policy for now? CSP would then block injected scripts from other hosts and `eval`, but not an injected inline script. Against that, React's output escaping stays the defense, as it is today.
2. **Per-request rendering (a):** defer until #1344 is under 2 s, and accept that the strict policy stays report-only on ISR pages until then?
3. **Report noise:** send the report-only strict policy on dynamic pages only, so the reports show new script sources, not the known ISR violations? Or keep it on every page?
4. **Log retention:** the Pro plan keeps runtime logs for about 12 hours, too short to read a "clean report window" of days. Keep it so (we read the reports in 12-hour windows), or add a log drain? A log drain is an infra and cost decision.
