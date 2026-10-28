# Proposal: the browser extension as a primary data source

- **Date:** 2026-10-28
- **Issue:** [DOS/Rate#1175](https://github.com/DOS/Rate/issues/1175)
- **Status:** PROPOSAL, awaiting JOY's decisions. No product code has changed.
- **Full decision document (Vietnamese):** [`2026-10-28-extension-data-source.html`](./2026-10-28-extension-data-source.html)

## Summary

The private crawlers hit bot walls. TikTok is paused (DOS/Rate-Services#658), Lazada search returns a punish page (DOS/Rate-Services#659), and Shopee works only through one logged-in runner. A real user's browser does not hit these walls, because the user opened the page.

The recommendation is **Option B**. With consent, the extension sends a minimal observation: price, stock, SKU, listing URL, timestamp and marketplace, and no personal data. The observation goes into a quarantine table. It becomes a public price only after DOS/Rate-Services corroborates it against the crawler or against independent submitters. The crawler stays as the seed and the cross-check.

The extension never fetches pages the user did not open, never evades bot detection and never solves captchas.

## Current state (read from `dev`)

- **Lookup:** on every product page, with no opt-in, the extension sends `GET /api/v1/rate/extension/lookup` with the URL, title, price, item id and shop id. This path is read-only.
- **Ingest:** with the opt-in on (off by default), the extension sends `POST /api/v1/rate/extension/ingest`. The route checks the payload with Zod and allows 15 requests per minute per IP. That limiter is in memory per serverless instance, not global. It then calls the `rate.enqueue_crowd_verify_signal` RPC, which enqueues an `extension_crowd_verify` job in `rate.crawl_jobs`. The RPC caps all crowd jobs at 120 per minute; this is the only global limit.
- **Quarantine today:** from a read of the Rate-Services code, the worker has no separate handler for this job type and re-crawls the URL like any other job. The price the user saw is not used as data, so the crowd signal does not help when the crawler is blocked.
- **Mismatches to fix under any option:**
  - The opt-in label says only the cleaned URL is sent. The payload actually has ten fields: platform, item id, shop id, URL, title, variant, price, original price, rating and rating count.
  - `CHROMEWEBSTORE.md` justifies `tabs` and `localhost`, which the manifest does not request. It omits five hosts that the manifest does request: TikTok, Hoang Ha, Di Dong Viet, Phong Vu and `www.rate.vn`. Its privacy section says the extension "only activates" on product pages of 6 domains, while the content script matches every path on 10 sites.
  - The default lookup sends browsing data without opt-in. That is probably allowed for a user-facing feature if it is disclosed, but this is an assumption and belongs in the legal review.
  - `*.tiktok.com` is broader than product pages need.
  - `/privacy-policy` does not mention the extension.
  - The extractor does not read stock.

## Comparable products (public sources only)

- **Honey:** Honey says it collects general product data such as price and availability, only on supported stores, to power price history and Droplist ([joinhoney.com](https://www.joinhoney.com/data-and-privacy/)). datarequests.org says Honey collects more browsing data than its policy states ([datarequests.org](https://datarequests.org/blog/honey-data-collection)).
- **Keepa:** Keepa says its add-on sends the ASIN of the product the user is viewing ([AMO](https://addons.mozilla.org/en-US/firefox/addon/keepa/)). In 2021, Wladimir Palant reported that the server instructs the extension to load, in the background, Amazon pages the user never opened ([palant.info](https://palant.info/2021/08/02/data-exfiltration-in-keepa-price-tracker/), [Chromium group](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/il9VqQBc8So)). Rate must not do this.
- **BeeCost:** BeeCost has extensions for Chrome and Coc Coc that show price history for Shopee, Tiki, Lazada and Sendo ([mytour.vn](https://mytour.vn/en/blog/bai-viet/top-5-features-of-beecost-the-ultimate-tool-for-finding-the-best-online-shopping-deals-mytour.html)). The developer claims over 100 million products ([ameblo.jp](https://ameblo.jp/beecost/)). No public document describes how it collects data.

## Anti-poisoning, in short

- Every submission is untrusted, because the client is open and the API can be called directly.
- The server issues `submitter_id` when the user consents and records the first-seen time itself. A new id starts with low trust, so rotating ids gains nothing. The per-id limit only bounds honest clients.
- The raw IP is not stored. Rate-Services keeps a short-lived, salted hash of the network range (for example /24 or ASN) to test independence. That hash is personal data and is disclosed.
- Observations stay quarantined until they match the crawler or enough independent, trusted submitters.

## Why the extension is public while crawling is private

The extension is not a crawler. It ships to every user and can be unpacked, so a private repo would not hide it. Being open lets users and store reviewers check that it does what it says.

The sensitive part is how the server decides which submissions to trust. An attacker would call the API directly and would want to know the thresholds. That logic lives in DOS/Rate-Services. Secrecy is defense in depth only: the design must still hold if the rules leak, through default quarantine, independent corroboration and the crawler baseline.

| Piece                                                                          | Repo                                                     |
| :----------------------------------------------------------------------------- | :------------------------------------------------------- |
| Extension: page reading, consent UI, side panel                                | DOS/Rate (public)                                        |
| Payload schema `ExtensionObservation`                                          | DOS/Rate, `packages/shared-data`                         |
| Ingest API and basic validation (format, ranges, host, consent, coarse limits) | DOS/Rate, `apps/web`                                     |
| Quarantine table                                                               | Reference copy in DOS/Rate; official migration in DOS-Me |
| Verification and submitter trust scoring                                       | DOS/Rate-Services (private)                              |
| Crawler cross-check                                                            | DOS/Rate-Services (private)                              |
| Thresholds, weights, blocklists, detailed limits                               | DOS/Rate-Services (private config)                       |
| Promotion of observations to public `price_history`                            | DOS/Rate-Services (worker role)                          |
| Crawlers, proxy, captcha, bot evasion                                          | DOS/Rate-Services (private); never in the extension      |

## Options

| Option                                                  | Description                                                   | Verdict                                                                                           |
| :------------------------------------------------------ | :------------------------------------------------------------ | :------------------------------------------------------------------------------------------------ |
| A. Keep as is                                           | Fix the mismatches only.                                      | Safe, but does not solve the bot walls.                                                           |
| B. Passive observation with quarantine and verification | Described above.                                              | **Recommended.**                                                                                  |
| C. Distributed crawler in the extension                 | The server tells extensions to fetch pages in the background. | Rejected. This is scraper logic, it misuses users' IPs and sessions, and it risks store takedown. |

An official source (a marketplace affiliate or partner API), where one exists, can complement any option. Rate-Services would assess it separately.

## Milestones

| Milestone | Work                                                                                                                                                                                        | Repo              |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------- |
| M0        | JOY decides.                                                                                                                                                                                | -                 |
| M1        | Fix the disclosure copy, the privacy policy, `CHROMEWEBSTORE.md` drift and the TikTok host scope. Add an onboarding opt-in screen.                                                          | DOS/Rate          |
| M2        | Add the `ExtensionObservation v1` schema. The extractor reads stock and SKU. Ingest writes to a new quarantine table through a DOS-Me migration, with JOY's approval. Nothing is published. | DOS/Rate, DOS-Me  |
| M3        | Run verification in shadow mode for 2 to 4 weeks: score observations but publish nothing.                                                                                                   | DOS/Rate-Services |
| M4        | Promote corroborated observations with provenance. Get a legal opinion. Certify Limited Use in the developer dashboard. Submit to the Chrome Web Store and Edge Add-ons.                    | Both              |

**Proposed success thresholds:**

- On listings both sources cover, at least 98% of shadow observations within 1% of the crawler.
- On listings the crawler cannot reach (TikTok, blocked Shopee and Lazada), at least 95% of same-hour pairs from independent submitters within 1%, plus a weekly manual spot-check sample.
- Under 0.5% of promoted observations later proven wrong, meaning the crawler or a manual check contradicts them by more than 1% within 24 hours.
- Better price freshness on Shopee, Lazada and TikTok than with the crawler alone.
- Zero store rejections and zero privacy complaints.

## Open questions for JOY

1. Which option: A, B or C?
2. Should the opt-in stay a side-panel toggle, or also be asked on an onboarding screen?
3. Should submitters stay anonymous per install, or should a rate.vn sign-in add weight?
4. Should a listing seen by one user only, which the crawler cannot reach, stay hidden or show as unverified?
5. Should we get a legal opinion before wide release, and with what budget?
6. Which store developer account should publish, and should Edge ship together with Chrome?
7. Should ratings stay in the payload?
