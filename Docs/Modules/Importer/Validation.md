# Data Validation Pipeline for Rate-Importer

## 🏗️ Layered Validation Architecture

Áp dụng 5 lớp kiểm tra dữ liệu để tối ưu chất lượng, hiệu năng và chi phí cho crawler:

```
Raw Data → Pre-Processing → Basic Validation → Business Rules → AI/ML Verification → Final Enrichment
```

---

## 1️⃣ Pre-Processing (Lọc sơ bộ)

- Làm sạch dữ liệu: loại bỏ HTML, chuẩn hóa whitespace, decode URL
- Kiểm tra trường bắt buộc (link, domain, nội dung)
- Loại bỏ bản ghi noise, trùng lặp, hoặc thiếu thông tin
- **Deduplication đa trường:**
  - **Kết hợp cả pg_trgm và pgvector** để phát hiện trùng lặp trên nhiều loại trường (tên, email, số điện thoại, tiêu đề, mô tả...)
  - Lọc sơ bộ bằng pg_trgm với các trường ngắn (name, email, phone, address, product_title)
  - So khớp sâu bằng pgvector với trường dài (description, content)
  - Có thể dùng rule hoặc ML để tổng hợp kết quả
- **Lưu ý:**
  - Cần enable cả hai extension trên PostgreSQL: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` và `CREATE EXTENSION IF NOT EXISTS vector;`
  - Cần encode text thành vector bằng mô hình NLP (vd: sentence-transformers) trước khi insert vào DB

**Ví dụ:**

```js
function preProcess(record) {
  // Clean HTML, trim, decode, check required fields
  // Remove duplicates (multi-field dedup)
  // 1. Fuzzy match (pg_trgm) on name/email/phone/title
  // 2. Semantic match (pgvector) on description/content
  ...
}
```

---

## 2️⃣ Basic Validation (Rule-based)

- **Checklist các bước kiểm tra cơ bản:**
  - [ ] Link phải hợp lệ (bắt đầu bằng http/https, không chứa ký tự lạ)
  - [ ] Domain phải thuộc whitelist (nếu có) và không thuộc blacklist
  - [ ] Nội dung không được rỗng, không chứa script/html nguy hiểm
  - [ ] Độ dài link và domain trong giới hạn cho phép
  - [ ] Không chứa ký tự unicode bất thường (emoji, ký tự control...)
  - [ ] Gắn flag lỗi rõ ràng nếu không hợp lệ (ví dụ: `invalid_link`, `blacklisted_domain`, `empty_content`)
  - [ ] Đánh điểm cơ bản (score) cho record: hợp lệ = 100, nghi ngờ = 50, lỗi = 0 (thang điểm 0-100)

**Schema record:**

- **name:** Tên nghi phạm/scammer (nickname, tên đăng bài, tên giả)
- **bank_account_name:** Tên chủ tài khoản ngân hàng (nếu extract được, thường là tên thật)
- **email, phone, address, product_title, description:** Các trường sẽ được xử lý dedup đa tầng
- **dedup_score:** Trả về điểm nghi ngờ trùng lặp (tổng hợp từ cả pg_trgm và pgvector)

---

## 3️⃣ Business Rules (Quy tắc nghiệp vụ)

- Kiểm tra blacklist/whitelist nâng cao
- Rule đặc thù ngành (vd: số tài khoản ngân hàng hợp lệ, format đúng, tên phải khớp chủ tài khoản...)
- Gắn nhãn (flag) theo logic nghiệp vụ

---

## 4️⃣ AI/ML Verification

- Áp dụng mô hình ML/AI để phát hiện pattern lạ, nghi ngờ scam, gian lận
- Có thể dùng model classification, anomaly detection, hoặc LLM để kiểm tra nội dung

---

## 5️⃣ Final Enrichment

- Chuẩn hóa, enrich thêm metadata (vd: chuẩn hóa địa chỉ, mapping domain, enrich thông tin profile...)
- Chuẩn bị dữ liệu cho downstream (Strapi, API, dashboard...)

---

## ⚡️ Kế hoạch triển khai dedup đa trường PostgreSQL

1. **Enable extension:**
   - `pg_trgm` cho fuzzy string match
   - `pgvector` cho semantic search
2. **Thiết kế schema:**
   - Các trường ngắn: TEXT + index GIN/GIN_TRGM
   - Trường dài: VECTOR + index HNSW hoặc IVFFlat
3. **Pipeline Python:**
   - Encode text dài thành vector (sentence-transformers...)
   - Insert/update vào DB
   - API dedup: nhận record, query multi-field dedup, trả về score + bản ghi nghi ngờ
4. **Query mẫu:**
   - Lọc sơ bộ bằng pg_trgm, sau đó so khớp sâu bằng pgvector
   - Có thể dùng stored procedure hoặc Python wrapper
5. **Tích hợp vào validation pipeline:**
   - Gọi API dedup ở bước pre-processing
   - Gắn flag/scoring cho downstream

---

## 📝 Lưu ý thực tế

- Có thể tối ưu performance bằng cách lưu cache kết quả dedup, hoặc chỉ recheck khi có thay đổi lớn
- Có thể mở rộng logic scoring/ML cho các use-case đặc thù (scam, spam, fraud...)
- Luôn log lại các bản ghi nghi ngờ để kiểm tra thủ công nếu cần

---

## TODO/NEXT

- Viết module Python dedup đa trường (pg_trgm + pgvector)
- Viết API wrapper (FastAPI hoặc script CLI)
- Tích hợp vào validation pipeline
- Viết test case và demo query thực tế

- **phone:** Số điện thoại (theo định dạng Việt Nam: 0/ +84 và 8-10 số)
- **bank:** Thông tin ngân hàng (tên ngân hàng + số tài khoản, nhận diện qua danh sách ngân hàng phổ biến)
- **scam_amount:** Số tiền liên quan đến vụ scam (dạng số, có thể kèm đơn vị VNĐ, triệu, nghìn, v.v.)
- **content:** Nội dung chính của bài viết (lọc từ các thẻ HTML như entry-content, post-content, article)
- **evidence_images:** Danh sách URL hình ảnh bằng chứng (ảnh giao dịch, chat, chuyển khoản, ...)
- **url:** Đường dẫn gốc của trang bị crawl
- **timestamp:** Thời điểm crawl dữ liệu
- **success:** Trạng thái crawl thành công (true/false)
- **error:** (chỉ có khi lỗi) – thông báo lỗi nếu parse thất bại

**Ví dụ:**

```js
function applyBasicValidation(record, whitelistDomains, blacklistDomains) {
  // Kiểm tra link hợp lệ
  const urlRegex =
    /^(https?:\/\/)[\w.-]+(\.[\w\.-]+)+[\w\-\._~:/?#[\]@!$&'()*+,;=.]+$/
  if (!record.link || !urlRegex.test(record.link)) {
    record.flag = "invalid_link"
    record.score = 0
    return record
  }

  // Kiểm tra domain
  const domain = new URL(record.link).hostname.replace(/^www\./, "")
  if (blacklistDomains.includes(domain)) {
    record.flag = "blacklisted_domain"
    record.score = 0
    return record
  }
  if (whitelistDomains.length && !whitelistDomains.includes(domain)) {
    record.flag = "not_in_whitelist"
    record.score = 0.5
  }

  // Kiểm tra nội dung
  if (!record.content || record.content.trim().length < 10) {
    record.flag = "empty_content"
    record.score = 0.5
    return record
  }
  // Không chứa script/html nguy hiểm
  if (/<script|<iframe|onerror=|onload=/.test(record.content)) {
    record.flag = "unsafe_content"
    record.score = 0
    return record
  }

  // Nếu qua hết các bước trên
  record.flag = "valid"
  record.score = 1
  return record
}
```

- **Tip:**
  - Có thể mở rộng thêm các rule khác tùy theo đặc thù nguồn crawl.
  - Nên log lại các record bị flag để dễ debug và audit.

---

## 3️⃣ Business Rules (Domain Logic)

- Áp dụng rule nghiệp vụ: phát hiện scam keyword, kiểm tra số tiền nghi ngờ, mapping với blacklist/whitelist
- Điều chỉnh score, gắn flag đặc biệt (scam, nghi ngờ, hợp lệ)

**Ví dụ:**

```js
function applyBusinessRules(record) {
  // Trừ/cộng điểm theo rule nghiệp vụ, flag scam
  ...
}
```

---

## 4️⃣ AI/ML Verification (Chỉ khi cần)

- Gọi LLM/AI khi record mơ hồ, score trung bình, hoặc nội dung phức tạp
- Trả về đánh giá AI: confidence, category, severity

**Ví dụ:**

```js
async function aiVerification(record) {
  // Gọi API AI/ML phân loại scam
  ...
}
```

---

## 5️⃣ Final Enrichment (Bổ sung dữ liệu)

- Chuẩn hóa output cuối cùng, bổ sung metadata (timestamp, source, crawlId)
- Mapping dữ liệu sang schema chuẩn (chuẩn bị push lên Strapi/API)

**Ví dụ:**

```js
function enrichRecord(record) {
  // Add metadata, chuẩn hóa schema
  ...
}
```

---

## 🔗 Liên kết & Tham khảo

- [Validation pipeline của Rate-Extension](../../Rate-Extension/Validation.md)
- [Platform Overview](../../Platform/Overview.md)
- [Roadmap Rate-Importer](./Roadmap.md)

---

## 📌 Ghi chú

- Mỗi lớp validation nên tách thành function riêng, dễ test/unit test.
- Có thể mở rộng thêm rule hoặc tích hợp AI khi cần.
- Tất cả lỗi/flag nên log lại để debug và audit.

---

> **Cập nhật:** File này sẽ được update liên tục khi pipeline validation thay đổi hoặc bổ sung tính năng mới.
