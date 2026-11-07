# Recommendation: enforce the CSP `script-src` on ISR pages (DOS/Rate#1323)

**Status:** recommendation with a working change in the PR. It builds on [`2026-10-30-csp-enforce-options.md`](./2026-10-30-csp-enforce-options.md), which compared the options; this note confirms its pick with the measured data and ships it. JOY decides the one trade-off below before merge.

## Recommendation

**Enforce an origin plus inline `script-src` now, in the page `<meta>` tag. Keep the strict nonce policy report-only.** Pages stay ISR.

```
script-src 'self' 'unsafe-inline'; worker-src 'self' blob:     (enforced, <meta>)
script-src 'self' 'nonce-…' 'sha256-…' 'strict-dynamic'; …      (report-only, header)
```

Do not render the ISR pages per request to get a nonce, and do not try hashes for the inline Next.js scripts.

## Why not a nonce, hashes or `strict-dynamic` alone

| Approach                                                   | ISR kept                                                                                                                                                                                                                   | Verdict                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nonce on every page                                        | No. A nonce is minted per request by the proxy, but an ISR response is rendered once and replayed, so its inline scripts carry the nonce of the render that filled the cache (or none). Every view must then render (`ƒ`). | Strongest, but a cold product render was 12.3 s and a merchant 14.9 s (#1344). Not now.                                                                                                                                                                                    |
| Hashes for inline scripts                                  | Yes, in theory                                                                                                                                                                                                             | Not viable. The inline `self.__next_f.push(…)` RSC payload is page data, different per page and per regeneration. The proxy runs before the render, so its hash cannot be in a header. A `<meta>` list would need a post-render HTML rewrite that Next.js has no hook for. |
| `'strict-dynamic'` with a nonce                            | No                                                                                                                                                                                                                         | It only trusts scripts a nonced script loads. The inline payload and bootstrap scripts still need the nonce. On a cached page it blocks all of them.                                                                                                                       |
| `'unsafe-inline'` next to a nonce or hash                  | n/a                                                                                                                                                                                                                        | CSP2+ browsers ignore `'unsafe-inline'` once a nonce or hash is present, so the combination blocks the cached pages. The enforced policy must carry neither.                                                                                                               |
| **Origin plus inline, enforced; strict nonce report-only** | **Yes**                                                                                                                                                                                                                    | **Recommended.**                                                                                                                                                                                                                                                           |

## What the enforced policy gives and costs

- **Blocks:** a script from any other host (the usual injection and exfiltration payload), `eval`, plugins (`object-src 'none'`), and workers from other origins.
- **Does not block:** an injected inline script. React's output escaping stays the defense there, as it is today. This is the trade-off JOY accepts.
- **Caching and speed:** unchanged. The policy is a build-time constant in the layout, so no page becomes dynamic. The proxy, nonce and `X-Vercel-Cache` behaviour are untouched.
- **Vercel:** the policy is in a `<meta>` tag, not a header, so the nonce hand-off fixed in #1345 is untouched (Next.js and Vercel copy an enforcing header onto the request, and Next.js would then read the nonce from it). A `<meta>` policy cannot carry `frame-ancestors`, which `X-Frame-Options: SAMEORIGIN` keeps covering.
- **Preview deployments:** the Vercel toolbar loads from `vercel.live`, so only builds with `VERCEL_ENV=preview` add that host. The value is fixed at build time, so a preview build promoted to production would keep it; production builds never have it.
- **Development:** `next dev` adds `'unsafe-eval'` for React Refresh.
- **Third-party scripts:** the app loads none (no `next/script`, no analytics tag). Adding one later means adding its host here on purpose, which is the point of the policy.
- **Where the `<meta>` sits:** it covers only what the browser parses after it. The `<head>` scripts before it are the inline theme script and Next.js chunks, which the policy allows anyway. Everything in `<body>`, where injected markup lands, comes after it.

## Evidence

**Report window** (`vercel logs … -e production --since 12h --query 'csp violation' -n 1000`, read-only, 2026-11-07, the strict and the measured policy both reporting since #1454):

| policy                            | directive           | blocked               | lines |
| --------------------------------- | ------------------- | --------------------- | ----- |
| strict (nonce)                    | `script-src-elem`   | `/_next/static` chunk | 118   |
| strict (nonce)                    | `script-src-elem`   | `inline`              | 25    |
| **measured (origin plus inline)** | any                 | any                   | **0** |
| any                               | any other directive | any                   | **0** |

143 lines, none from the policy being enforced here, none from another host. The strict policy keeps reporting the known ISR noise (inline and chunk scripts on cached pages). Limits: the endpoint logs each distinct violation once per 10 minutes per instance and the plan's runtime log retention was about 12 hours when read, so "0" means none were logged.

**Preview proof:** see the PR for the Vercel preview and the e2e run (no `securitypolicyviolation` event and no CSP console error on `/`, a product page and a merchant page; meta carries the enforced directives; the report-only header and nonce unchanged).

**Monitoring note:** a `<meta>` policy cannot carry `report-uri`, so the enforced policy does not report itself. Its report-only twin (`policy=inline`, same directives) is the signal; on preview builds the twin lacks the toolbar host and may show noise.

## Decision for JOY

Accept `'unsafe-inline'` in the enforced policy for now (it blocks other hosts and `eval`, not an injected inline script)? If not, the only stronger path is per-request rendering of the ISR routes, gated on #1344 (a cold render under 2 s).

## Next steps

1. Merge this change; watch the `policy=inline` reports for a few 12-hour windows. Any hit is a real break to fix or revert (revert is one constant).
2. When #1344 makes a cold render cheap, move routes to per-request nonces one at a time (lightest first: about-us, contact-us, developers), then enforce the strict policy there.
3. Optional, separate: `experimental.sri` for chunk integrity.
4. Log retention (about 12 hours) is still an infra and cost decision for JOY (a log drain).
