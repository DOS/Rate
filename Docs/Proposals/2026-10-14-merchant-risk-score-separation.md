# Proposal: tách điểm rủi ro của merchant (Rate) khỏi điểm DOSafe

- **Ngày:** 2026-10-14
- **Issue:** [DOS/Rate#15](https://github.com/DOS/Rate/issues/15)
- **Trạng thái:** CHỜ QUYẾT ĐỊNH (chưa code gì)

## 1. Vấn đề

`rate.merchants.risk_score` được schema gốc mô tả là *"Synced / cached from DOSafe threat intelligence"*.
Từ commit `a483c2a`, `AiReviewAnalyzer.persistAnalysisToSupabase()` **ghi đè** cột này bằng điểm rủi ro
suy ra từ review (seeding, giá phá bất thường...). Hai nguồn có ý nghĩa khác nhau cùng ghi vào một cột.

## 2. Dữ liệu thực tế (đo trên Supabase `gulptwduchsjcsbndmua`, 2026-10-14)

| Mục | Giá trị | Ý nghĩa cho quyết định |
| :--- | :--- | :--- |
| `rate.merchants` | 1 dòng (Apple Flagship Store), `risk_score = 0` | **Hiện chưa có gì để đè** - quyết định rẻ nhất ngay lúc này |
| Merchant khớp `dosafe.threat_intel` / `entity_scores` | 0 / 0 | Chưa có merchant nào bị DOSafe gắn cờ |
| `dosafe.threat_intel` | 8.322.888 dòng, thang `risk_score` 0-100, mọi dòng `status='active'` | DOSafe là kho dữ liệu lớn, nguồn bên ngoài, cùng thang điểm với Rate |
| `threat_intel` index | `UNIQUE (entity_hash, source)` | **Một entity_hash có thể có nhiều dòng (mỗi nguồn một dòng)** |
| `dosafe.entity_scores` | PK `(entity_type, entity_hash)`; có `risk_level` (safe/low/medium/high), `confidence`, `signals`, `expires_at` | DOSafe đã có sẵn điểm tổng hợp dạng cache, có hạn dùng |
| Entity types của DOSafe | phone, bank_account, domain, url, facebook, email, wallet, ip, ... | Merchant có cột `phone`, `bank_account` -> có thể tra thêm ngoài `entity_hash` |
| Nơi UI đọc điểm | 1 chỗ: `smartphones/[slug]/page.tsx` -> `Trust: {100 - risk_score}%` qua `rate-api.ts` | Đổi nguồn điểm chỉ cần sửa 1 chỗ đọc |
| Trigger trên `rate.merchants` | không có | Không có logic ngầm nào phụ thuộc cột |

### Phát hiện phụ (lỗi tiềm ẩn có sẵn từ trước)

View `rate.v_products_with_merchant_trust` làm `LEFT JOIN dosafe.threat_intel t ON t.entity_hash = m.entity_hash`.
Vì `threat_intel` có thể có nhiều dòng cho cùng `entity_hash` (mỗi `source` một dòng), view này sẽ **nhân bản dòng sản phẩm**
khi merchant bị nhiều nguồn gắn cờ. Hiện chưa lộ ra vì chưa merchant nào khớp. (Chưa có code nào trong repo đọc view này.)

## 3. Các phương án

| | A. Giữ 1 cột, ghi đè/`GREATEST` khi ghi | **B. Tách cột + gộp lúc đọc (đề xuất)** | C. Nhét vào `metadata` JSONB | D. Bảng riêng `merchant_risk_assessments` |
| :--- | :--- | :--- | :--- | :--- |
| Mất nguồn gốc điểm? | Có - không biết điểm từ đâu | Không | Không | Không |
| Hai bên ghi đè nhau? | Có (ai ghi sau thắng) | Không - mỗi bên một cột | Không | Không |
| Ràng buộc 0-100, index | Có | Có | **Không** (JSONB) | Có |
| Điểm cũ/stale | Khó phát hiện | Có `review_risk_updated_at` | Tự làm | Có lịch sử đầy đủ |
| Lưu "lý do" (minh bạch open-source) | Không | Có (cột jsonb `risk_breakdown`) | Có | Có, kèm lịch sử |
| Công sức | Rất thấp | **Thấp** (1 migration nhỏ + sửa 2 chỗ) | Thấp | Cao; trùng một phần `merchant_snapshots` |
| Rủi ro | Cao - xóa dữ liệu DOSafe | Thấp | Trung bình | Thấp nhưng thừa cho quy mô hiện tại |

## 4. Đề xuất: **B - TÁCH ra** (đúng, nên tách)

1. **Giữ `risk_score` = điểm DOSafe** như schema gốc đã định nghĩa. Pipeline Rate **không bao giờ ghi** vào cột này nữa.
2. **Thêm cột cho điểm của Rate:** `review_risk_score smallint CHECK 0..100`, `review_risk_breakdown jsonb` (danh sách lý do hiển thị cho người dùng), `review_risk_updated_at timestamptz`.
3. **Điểm cuối cùng tính lúc đọc** trong một view mới (`security_invoker`):
   `final_risk = GREATEST(dosafe_risk, review_risk)`, `trust = 100 - final_risk`.
   - Dùng `GREATEST` (không dùng trung bình) vì **kẻ lừa đảo thường mua review ảo**: nếu lấy trung bình, một shop đã bị DOSafe gắn cờ scam vẫn có thể trông "an toàn" nhờ review đẹp. Điểm cao nhất thắng thì hàng blacklist không bao giờ bị pha loãng.
   - `dosafe_risk` lấy bằng subquery gộp (`MAX` trên `threat_intel` còn `active` và chưa hết hạn), **không JOIN trực tiếp** để không nhân bản dòng. Sửa luôn view cũ theo cách này.
4. UI đổi sang đọc `final_risk`/`trust` từ view mới (1 chỗ).

### Những điểm CHƯA chắc (cần bạn hoặc chủ DOSafe xác nhận)
- Nên dùng `dosafe.entity_scores` (điểm tổng hợp có `confidence`) hay `MAX(threat_intel.risk_score)` thô? Mình chưa biết DOSafe coi bảng nào là chuẩn. Nếu `entity_scores` là điểm chính thức thì nên ưu tiên nó khi chưa hết hạn, `threat_intel` làm dự phòng.
- Có tra thêm theo `phone` / `bank_account` / domain của shop (không chỉ `entity_hash`) không? Tăng độ phủ nhưng cần crawler lấy được các trường đó (hiện merchant duy nhất chưa có phone/bank).
- Ngưỡng `risk_level`: DOSafe có thang safe/low/medium/high; mình chưa xác minh ngưỡng điểm chính xác nên chưa map.

## 5. Nếu chọn B, các bước thực hiện
1. Migration: thêm 3 cột + view `rate.v_merchant_trust` + sửa `v_products_with_merchant_trust` (hết nhân bản dòng).
2. `persistAnalysisToSupabase`: ghi vào `review_risk_*` thay vì `risk_score`; cập nhật test.
3. `rate-api.ts` + `page.tsx`: đọc điểm cuối từ view mới.
4. Đồng bộ sang `DOS/Rate-Services`.
