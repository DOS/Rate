# Chrome Web Store Listing & Compliance - Rate.vn Browser Extension (MV3)

- **Last Updated:** 2026-11-04
- **Current Version:** 2.0.0
- **Category:** Shopping

---

## 1. Store Listing Copy

### Extension Name

Rate.vn - So Sánh Giá, Lịch Sử Giá & Lọc Đánh Giá Ảo AI

### Short Summary (<= 132 characters)

Xem lịch sử giá 90 ngày, phát hiện giảm giá ảo, tìm nơi bán rẻ hơn, lọc đánh giá ảo bằng AI trên 10 sàn và chuỗi bán lẻ Việt Nam.

### Detailed Description

Rate.vn giúp người tiêu dùng mua sắm đồ công nghệ minh bạch và tiết kiệm hơn ngay khi đang xem sản phẩm trên Shopee, Lazada, Tiki, TikTok Shop, CellphoneS, Thế Giới Di Động, FPT Shop, Hoàng Hà Mobile, Di Động Việt và Phong Vũ:

- Phát hiện Giảm Giá Ảo: Tự động đối chiếu mức giá hiện tại và mức giá gạch ngang với lịch sử giá đã xác minh để nhận diện khuyến mãi thật hay nâng giá gốc rồi giảm ảo.
- So Sánh Giá Đa Sàn Tức Thì: Hiển thị ngay các gian hàng chính hãng khác đang bán cùng mẫu điện thoại, máy tính bảng, laptop với mức giá thấp hơn.
- Điểm Đánh Giá Đã Lọc Seeding AI: Xem điểm chất lượng thực tế sau khi loại bỏ các bình luận spam cày xu và đánh giá ảo, kèm tóm tắt ưu nhược điểm rõ ràng.
- Hồ Sơ Rủi Ro Gian Hàng Kép: Kiểm tra mức độ uy tín của người bán kết hợp giữa dữ liệu bảo mật DOSafe và chất lượng đánh giá thực tế.
- So Sánh Thông Số 10 Nhóm: Mở nhanh bảng đối chiếu chi tiết cấu hình trên Rate.vn chỉ với 1 cú nhấp chuột.

---

## 2. Permissions Justification (For Chrome Web Store Review Team)

This table lists exactly what `manifest.json` requests; `test-extension-pipeline.ts` fails when the two disagree (DOS/Rate#1231).

| Permission / Host Permission                                                                                                                                                                                                                                                                               | Plain-English Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                                                                                                                                                                                                                                                                                  | Saves the user's preferred Rate.vn server endpoint, a temporary product lookup cache for the active session, and the user's explicit opt-in preference for contributing product price signals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `sidePanel`                                                                                                                                                                                                                                                                                                | Displays the price history chart, cross-merchant price comparison table and AI review authenticity breakdown beside the shopping page when the user clicks the extension badge or floating pill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `https://shopee.vn/*`, `https://*.lazada.vn/*`, `https://tiki.vn/*`, `https://www.tiktok.com/*`, `https://shop.tiktok.com/*`, `https://cellphones.com.vn/*`, `https://*.thegioididong.com/*`, `https://fptshop.com.vn/*`, `https://hoanghamobile.com/*`, `https://didongviet.vn/*`, `https://phongvu.vn/*` | Runs the content script on the 10 supported Vietnamese stores. It reads the public product title, selected variant, listed price, original price and rating of a product page to show the floating price-check badge. The script loads on every page of these sites because they navigate in-page, but it reads and sends nothing on pages it does not recognise as a product page. On `www.tiktok.com` it loads only on product page paths (`/view/product/`, `/@shop/product/`, `/shop/.../pdp/`), not on the video feed or video pages (DOS/Rate#1601). A product page reached by in-page navigation from the feed gets the badge after a reload; `shop.tiktok.com` serves only shop pages (DOS/Rate#1232). |
| `https://rate.vn/*`, `https://www.rate.vn/*`                                                                                                                                                                                                                                                               | Fetches verified price history, cross-merchant offers and review authenticity scores from the Rate.vn API, and sends the opt-in crowd signal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## 3. Privacy & User Data Disclosure

1. **Where it runs:** the content script loads on the 10 supported stores listed above (`shopee.vn`, `lazada.vn`, `tiki.vn`, TikTok Shop product pages on `www.tiktok.com` and `shop.tiktok.com`, `cellphones.com.vn`, `thegioididong.com`, `fptshop.com.vn`, `hoanghamobile.com`, `didongviet.vn`, `phongvu.vn`). It acts only on pages it recognises as a product page. The extension itself never opens or fetches pages the user did not open, never works around a store's bot checks and never solves captchas.
2. **Lookup (on by default, no opt-in):** on a recognised product page the extension sends `GET /api/v1/rate/extension/lookup` with the store, the product URL with query parameters and tracking tokens (`utm_*`, `sp_atk`, `xptdk`, `fbclid`, `gclid`) stripped locally, the product title, the store's item id and shop id, the selected variant, the listed price and the original price. The request is read-only and carries no account, name, email or cookies.
3. **Opt-in crowd signal (off by default):** only when the user chooses "Có" / "Yes" on the consent page opened once at first install, or turns on "Đóng góp phát hiện sản phẩm mới (chỉ khi bạn bật)" (English: "Help find new products (only when you turn it on)") in the Side Panel, the extension also sends `POST /api/v1/rate/extension/ingest` with the store, item id, shop id, cleaned URL, title, selected variant, price, original price, rating and rating count. The toggle's label lists these same fields (DOS/Rate#1230). Submissions go to a moderation queue, stored with the time the server received them; Rate.vn's servers may re-check the listing on the store. They never change public prices directly. Closing the consent page keeps the opt-in off, and updates or reloads do not open it again (DOS/Rate#1603).
4. **Stored in the browser only:** the server address and the opt-in choice (`chrome.storage.local`), and a session-only cache of the products viewed in each tab, the latest side panel search, their lookup results and a lookup wait time after a rate limit (`chrome.storage.session`).
5. **IP address:** like any web request, the Rate.vn server receives the user's IP address. The lookup and opt-in routes use it only for a per-minute request limit held in memory, and Rate.vn's code does not store it; the hosting provider keeps standard access logs for a short time.
6. **Side panel requests:** text the user types into the side panel search is sent to the same lookup endpoint; the side panel also reads public deals and merchant lists from the Rate.vn API.
7. **Privacy policy:** https://rate.vn/privacy-policy has a section on the extension.

---

## 4. Version History

The release checklist and the store changelog for the next upload, in Vietnamese and English, are in [`RELEASE.md`](./RELEASE.md).

- **2.0.0 (2026-10-14):** Complete Manifest V3 rewrite in TypeScript 7.0.2 featuring the Two-Speed Hybrid Lookup Pipeline, Shadow DOM Floating Trust Pill, Chrome Native Side Panel, Accessory Gatekeeper, Variant Disambiguation, Evidence-Based 5-Level Price Verdict, and Opt-In Quarantine Crowd Queue.
