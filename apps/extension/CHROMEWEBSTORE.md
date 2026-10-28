# Chrome Web Store Listing & Compliance - Rate.vn Browser Extension (MV3)

- **Last Updated:** 2026-10-14
- **Current Version:** 2.0.0
- **Category:** Shopping

---

## 1. Store Listing Copy

### Extension Name

Rate.vn - So Sánh Giá, Lịch Sử Giá & Lọc Đánh Giá Ảo AI

### Short Summary (<= 132 characters)

Kiểm tra lịch sử giá 90 ngày, phát hiện giảm giá ảo, tìm nơi bán rẻ hơn và lọc đánh giá seeding bằng AI trên Shopee, Lazada, Tiki.

### Detailed Description

Rate.vn giúp người tiêu dùng mua sắm đồ công nghệ minh bạch và tiết kiệm hơn ngay khi đang xem sản phẩm trên Shopee, Lazada, Tiki, CellphoneS, Thế Giới Di Động và FPT Shop:

- Phát hiện Giảm Giá Ảo: Tự động đối chiếu mức giá hiện tại và mức giá gạch ngang với lịch sử giá đã xác minh để nhận diện khuyến mãi thật hay nâng giá gốc rồi giảm ảo.
- So Sánh Giá Đa Sàn Tức Thì: Hiển thị ngay các gian hàng chính hãng khác đang bán cùng mẫu điện thoại, máy tính bảng, laptop với mức giá thấp hơn.
- Điểm Đánh Giá Đã Lọc Seeding AI: Xem điểm chất lượng thực tế sau khi loại bỏ các bình luận spam cày xu và đánh giá ảo, kèm tóm tắt ưu nhược điểm rõ ràng.
- Hồ Sơ Rủi Ro Gian Hàng Kép: Kiểm tra mức độ uy tín của người bán kết hợp giữa dữ liệu bảo mật DOSafe và chất lượng đánh giá thực tế.
- So Sánh Thông Số 10 Nhóm: Mở nhanh bảng đối chiếu chi tiết cấu hình trên Rate.vn chỉ với 1 cú nhấp chuột.

---

## 2. Permissions Justification (For Chrome Web Store Review Team)

This table lists exactly what `manifest.json` requests; `test-extension-pipeline.ts` fails when the two disagree (DOS/Rate#1231).

| Permission / Host Permission                                                                                                                                                                                                                                                                               | Plain-English Justification                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`                                                                                                                                                                                                                                                                                                  | Saves the user's preferred Rate.vn server endpoint, a temporary product lookup cache for the active session, and the user's explicit opt-in preference for contributing product price signals.                                                                                                                                                                                                                                                                |
| `sidePanel`                                                                                                                                                                                                                                                                                                | Displays the price history chart, cross-merchant price comparison table and AI review authenticity breakdown beside the shopping page when the user clicks the extension badge or floating pill.                                                                                                                                                                                                                                                              |
| `https://shopee.vn/*`, `https://*.lazada.vn/*`, `https://tiki.vn/*`, `https://www.tiktok.com/*`, `https://shop.tiktok.com/*`, `https://cellphones.com.vn/*`, `https://*.thegioididong.com/*`, `https://fptshop.com.vn/*`, `https://hoanghamobile.com/*`, `https://didongviet.vn/*`, `https://phongvu.vn/*` | Runs the content script on the 10 supported Vietnamese stores. It reads the public product title, selected variant, listed price, original price and rating of a product page to show the floating price-check badge. The script loads on every page of these sites because they navigate in-page, but it reads and sends nothing on pages it does not recognise as a product page. TikTok is limited to the two hosts its product pages use (DOS/Rate#1232). |
| `https://rate.vn/*`, `https://www.rate.vn/*`                                                                                                                                                                                                                                                               | Fetches verified price history, cross-merchant offers and review authenticity scores from the Rate.vn API, and sends the opt-in crowd signal.                                                                                                                                                                                                                                                                                                                 |

---

## 3. Privacy & User Data Disclosure

1. **Where it runs:** the content script loads on the 10 supported stores listed above (`shopee.vn`, `lazada.vn`, `tiki.vn`, `www.tiktok.com`, `shop.tiktok.com`, `cellphones.com.vn`, `thegioididong.com`, `fptshop.com.vn`, `hoanghamobile.com`, `didongviet.vn`, `phongvu.vn`). It acts only on pages it recognises as a product page; it never opens or fetches pages the user did not open.
2. **Lookup (on by default, no opt-in):** on a recognised product page the extension sends `GET /api/v1/rate/extension/lookup` with the store, the product URL with query parameters and tracking tokens (`utm_*`, `sp_atk`, `xptdk`, `fbclid`, `gclid`) stripped locally, the product title, the store's item id and shop id, the selected variant, the listed price and the original price. The request is read-only and carries no account or personal data.
3. **Opt-in crowd signal (off by default):** only when the user turns on "Đóng góp phát hiện sản phẩm mới (Opt-In)" in the Side Panel, the extension also sends `POST /api/v1/rate/extension/ingest` with the store, item id, shop id, cleaned URL, title, selected variant, price, original price, rating and rating count. The toggle's label lists these same fields (DOS/Rate#1230). Submissions go to a moderation queue and never change public prices directly.
4. **Stored in the browser only:** the server address and the opt-in choice (`chrome.storage.local`), and a session-only cache of the products viewed in each tab and their lookup results (`chrome.storage.session`).
5. **Side panel requests:** text the user types into the side panel search is sent to the same lookup endpoint; the side panel also reads public deals and merchant lists from the Rate.vn API.
6. **Privacy policy:** https://rate.vn/privacy-policy has a section on the extension.

---

## 4. Version History

- **2.0.0 (2026-10-14):** Complete Manifest V3 rewrite in TypeScript 7.0.2 featuring the Two-Speed Hybrid Lookup Pipeline, Shadow DOM Floating Trust Pill, Chrome Native Side Panel, Accessory Gatekeeper, Variant Disambiguation, Evidence-Based 5-Level Price Verdict, and Opt-In Quarantine Crowd Queue.
