# Rate-Extension Changelog

## [1.0.4] - 2025-06-07
### Changed
- Export Shopee Reviews trực tiếp từ popup, không còn lỗi createObjectURL (Manifest V3/service worker).
- UX: Nút Export = Extract + Export tự động, chỉ cần bấm 1 lần.
- Tăng version lên 1.0.4.
- Fix triệt để các lỗi export file trên Chrome mới.


## [2025-06-06]
### Added
- Khởi tạo tài liệu README, roadmap, changelog cho module extension
- Tổng hợp tính năng passive crawling, export, popup UI, validation pipeline

### Changed
- Refactored validation logic to support multi-country phone/account patterns
- Improved documentation structure and naming convention
- Chuẩn hóa số điện thoại về E.164 (quốc tế, +84...), chỉ lưu 1 trường phone, không tách country/national trong schema mặc định
- Giải thích lý do chọn best practice này trong docs
- Cập nhật lại docs và mapping cho đồng bộ
- Chuẩn hóa cấu trúc tài liệu theo RateBox Docs

---

## [2025-06-01]
### Added
- Tích hợp passive crawling checkscam.vn
- Popup UI: preview, export, debug
- Export JSON tự động
- Discord popup handler

## [2025-05-20]
### Added
- Khởi tạo module Rate-Extension
- Cấu hình manifest, background, content-script, popup

---

**Changelog tuân thủ chuẩn Keep a Changelog.**
