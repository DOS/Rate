# Chrome Web Store release: checklist and changelog

Release-readiness check of the extension built from `dev` at `fc9b820d` on 2026-10-30. The check was read-only: nothing was published, and the live API was used with a few GET requests.

## 1. Readiness check (2026-10-30)

| Check                                          | Result                    | Evidence                                                                                                                                                                                                                                                  |
| :--------------------------------------------- | :------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build (`pnpm --filter @repo/extension build`)  | Pass                      | `dist/` holds 11 files, 936 KB. The manifest is MV3, version `2.0.0`.                                                                                                                                                                                     |
| Extension tests, typecheck, lint               | Pass                      | `test-extension-pipeline.ts` passes, including #1302, #1304 and #1326; `eslint --max-warnings 0` is clean.                                                                                                                                                |
| Manifest permissions match `CHROMEWEBSTORE.md` | Pass                      | `storage` and `sidePanel`; 11 store host patterns (10 stores, TikTok on two hosts) plus `rate.vn` and `www.rate.vn`. The content-script matches equal the store hosts. The pipeline test enforces this (#1231).                                           |
| `review_risk_score: null` shown as no data     | Pass                      | The live lookup returns `null` for a seller with no analysed review, and the side panel shows `reviewRiskNoData` (#1266).                                                                                                                                 |
| `dosafe_risk_score: null`                      | Fixed in #1465 (PR #1476) | A seller with no DOSafe score answers null from the API and reads "chưa đủ dữ liệu" in the side panel, never "0".                                                                                                                                         |
| Verdict `messageKey` and the locale catalogue  | Pass                      | All 10 server keys (`apps/web/src/server/rate/extension.ts`) map in `VERDICT_MESSAGES`. Every label and explanation exists in vi, en and cs with the right placeholder count. The live lookup returns `genuine_deal` and `fair_market` with their params. |
| Lookup ranking (#1379)                         | Pass                      | Live lookup of "Apple iPhone 16 128GB" matches `apple-iphone-16-128gb`, not the 16e.                                                                                                                                                                      |
| 429 handling                                   | Fixed in #1466            | After a 429 the extension sends no lookup until `Retry-After` (default 60 s, cap 600 s), the panel says how many seconds to wait, and the pill looks the product up again once the wait is over.                                                          |
| No locale sent                                 | Pass                      | The lookup sends platform, URL, title, mode, ids, variant and prices, but no locale. The verdict is rendered from `messageKey` in the extension's language.                                                                                               |
| Version header                                 | Fixed in #1466            | `X-Rate-Extension-Version` reads `chrome.runtime.getManifest().version`.                                                                                                                                                                                  |

## 2. Release checklist (JOY publishes)

1. Ship with #1465 (PR #1476) and #1466 merged: both are user-visible fixes the changelog below assumes.
2. Set the version. If `2.0.0` was ever uploaded to the store, raise it, for example to `2.1.0`, in `manifest.json` and `package.json`; the API header follows the manifest.
3. Build from a clean checkout of the release commit with `pnpm install --frozen-lockfile` then `pnpm --filter @repo/extension build`. Zip the **contents** of `apps/extension/dist/`, with `manifest.json` at the top of the zip.
4. Test the unpacked build in Chrome (`chrome://extensions`, Developer mode, Load unpacked `dist/`):
   - **Product pages:** on one product page each of Shopee, Tiki and CellphoneS, the pill appears and the side panel opens.
   - **Language:** set Chrome to English, then Czech. The panel and the verdict follow the browser language, and en/cs never show the Vietnamese review summary (#1385).
   - **Opt-in:** the crowd opt-in is off by default, and its label names the fields it sends (#1230, #1241).
5. Update the store listing:
   - Description and screenshots match the panel as it is now (the price list and the states from #1319).
   - The changelog below.
   - Privacy fields and the permission justifications are copied from `CHROMEWEBSTORE.md` sections 2 and 3, with https://rate.vn/privacy-policy as the privacy policy.
   - Optional: add the en listing text, since the extension now ships en and cs.
6. Upload and submit for review. Watch for reviewer questions about the host permissions; section 2 of `CHROMEWEBSTORE.md` has the answers.

## 3. Store listing changelog

### Tiếng Việt

**Có gì mới (từ bản 2.0.0, 14/10/2026)**

- Giao diện có tiếng Việt, tiếng Anh và tiếng Séc, theo ngôn ngữ của trình duyệt. Nhận định về giá cũng hiện theo ngôn ngữ này.
- Bảng giá các nơi bán rõ hơn, có trạng thái trống và trạng thái lỗi. Khi tra cứu bị giới hạn hoặc lỗi mạng, bạn bấm "Thử lại" để tra lại.
- Biểu tượng trên thanh công cụ cho biết nhanh giá đang xem có tốt không. Tin bán đã hết hàng không còn được tính vào giá so sánh.
- Nhận diện sản phẩm chính xác hơn: tra "iPhone 16" không còn ra iPhone 16e. Trang danh mục và trang thương hiệu không bị nhầm là trang sản phẩm.
- Gian hàng chưa có đánh giá được phân tích sẽ ghi "Chưa có dữ liệu", không hiện con số rủi ro.
- Lựa chọn "Đóng góp phát hiện sản phẩm mới" ghi rõ những gì được gửi đi và vẫn tắt mặc định. TikTok chỉ còn chạy trên trang sản phẩm.

### English

**What's new (since 2.0.0, 2026-10-14)**

- Vietnamese, English and Czech, following your browser language. The price verdict is shown in that language too.
- A clearer list of where to buy, with empty and error states. When a lookup is rate-limited or the network fails, press "Retry" to look it up again.
- The toolbar badge shows at a glance whether the price you see is a good one. Sold-out listings no longer count towards the price comparison.
- More accurate product matching: "iPhone 16" no longer matches the iPhone 16e. Category and brand pages are no longer mistaken for product pages.
- Sellers with no analysed reviews show "No data yet" instead of a risk number.
- The "Help detect new products" option names exactly what it sends and is still off by default. On TikTok, the extension runs only on product pages.
