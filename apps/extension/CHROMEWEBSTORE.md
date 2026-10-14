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

| Permission / Host Permission                                                                                                                                    | Plain-English Justification                                                                                                                                                                                   |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`                                                                                                                                                       | Saves the user's preferred Rate.vn server endpoint, temporary product lookup cache for the active session, and the user's explicit opt-in preference for contributing public product price signals.           |
| `sidePanel`                                                                                                                                                     | Displays the detailed price history chart, cross-merchant price comparison table, and AI review authenticity breakdown alongside the shopping page when the user clicks the extension badge or floating pill. |
| `tabs`                                                                                                                                                          | Reads the active shopping tab's product URL and title so the Side Panel can display the matching price history and cross-store comparison for the product currently being viewed.                             |
| `https://shopee.vn/*`, `https://*.lazada.vn/*`, `https://tiki.vn/*`, `https://cellphones.com.vn/*`, `https://*.thegioididong.com/*`, `https://fptshop.com.vn/*` | Reads the public product title, selected storage variant, and listed price on supported Vietnamese e-commerce product pages to display the floating price-check badge.                                        |
| `https://rate.vn/*`, `http://localhost:3000/*`                                                                                                                  | Fetches verified price history, cross-merchant offers, and review authenticity scores from the Rate.vn API.                                                                                                   |

---

## 3. Privacy & User Data Disclosure

1. **No Personal or Browsing History Profiling:** Rate.vn only activates on supported product detail pages (`shopee.vn`, `lazada.vn`, `tiki.vn`, `cellphones.com.vn`, `thegioididong.com`, `fptshop.com.vn`).
2. **Automatic URL Canonicalization (Tracking Stripping):** Before performing any product lookup, all query parameters and tracking tokens (`utm_*`, `sp_atk`, `xptdk`, `fbclid`, `gclid`) are stripped locally in the browser. Only the clean product pathname, product title, selected storage variant, and displayed price are used for lookup.
3. **Opt-In Crowdsourced Verification Queue:** By default, the extension operates in **100% Read-Only Lookup Mode** (`GET /api/v1/rate/extension/lookup`). Enqueuing newly discovered public product listings for server-side verification (`POST /api/v1/rate/extension/ingest`) is **disabled by default** and requires the user to explicitly enable the "Đóng góp phát hiện sản phẩm mới (Opt-In)" toggle in the Side Panel.

---

## 4. Version History

- **2.0.0 (2026-10-14):** Complete Manifest V3 rewrite in TypeScript 7.0.2 featuring the Two-Speed Hybrid Lookup Pipeline, Shadow DOM Floating Trust Pill, Chrome Native Side Panel, Accessory Gatekeeper, Variant Disambiguation, Evidence-Based 5-Level Price Verdict, and Opt-In Quarantine Crowd Queue.
