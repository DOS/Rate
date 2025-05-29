# Review System Schema Design

## 📋 Tổng quan

Hệ thống Review được thiết kế để hỗ trợ đánh giá sản phẩm/dịch vụ theo 2 loại:

- **Expert Review**: Đánh giá từ chuyên gia
- **User Review**: Đánh giá từ người dùng thông thường

Hệ thống sử dụng **criteria-based rating** (đánh giá theo tiêu chí) tương tự Metacritic, Rotten Tomatoes.

## 🎯 Business Requirements

- **Rating Scale**: 1-10 cho cả Expert và User
- **No Anonymous Reviews**: Bắt buộc đăng nhập (có plan tích hợp blockchain verification)
- **Expert Auto-Publish**: Expert review không cần approval (MVP)
- **User Manual Approval**: User review cần duyệt trước khi hiển thị
- **Separate Scoring**: Expert và User score tính riêng biệt
- **Criteria-based**: Đánh giá theo nhiều tiêu chí (Design, Performance, Value...)

## 📊 Schema Design

### 1. Review Table (Unified)

Bảng chính chứa tất cả reviews, phân biệt qua `ReviewType`.

```
Field Name         | Type           | Required | Unique | Default | Description
------------------|----------------|----------|--------|---------|------------------
Title             | String         | YES      | NO     | -       | Tiêu đề review
Content           | Long Text      | NO       | NO     | -       | Nội dung đánh giá chi tiết
ReviewType        | Enum           | YES      | NO     | -       | [Expert, User]
Status            | Enum           | YES      | NO     | Draft   | [Draft, Pending, Published, Rejected, Archived]
ReviewDate        | DateTime       | YES      | NO     | now     | Ngày đánh giá

// Feature flags
is_Featured       | Boolean        | NO       | NO     | false   | Review nổi bật

// Verification fields
VerifiedPurchase  | Boolean        | NO       | NO     | false   | Đã mua/sử dụng thật
BlockchainVerified| Boolean        | NO       | NO     | false   | Đã verify blockchain (future)

// Social fields
HelpfulVotes      | Number         | NO       | NO     | 0       | Số vote hữu ích (calculated)
ReportedCount     | Number         | NO       | NO     | 0       | Số lần bị report (calculated)

// Admin fields
RejectionReason   | Text           | NO       | NO     | -       | Lý do từ chối (nếu Status = Rejected)
ModeratorNotes    | Text           | NO       | NO     | -       | Ghi chú của moderator
```

**Relations:**

- Review **belongs to** Item
- Review **belongs to** Identity (Reviewer)
- Review **has many** Ratings

---

### 2. Rating Table (Criteria-based)

Chứa điểm số cho từng tiêu chí của mỗi review.

```
Field Name     | Type           | Required | Unique | Default | Description
--------------|----------------|----------|--------|---------|------------------
Rating        | Number (1-10)  | YES      | NO     | -       | Điểm số cho tiêu chí này
Comment       | Text           | NO       | NO     | -       | Ghi chú cho tiêu chí cụ thể
```

**Relations:**

- Rating **belongs to** Review
- Rating **belongs to** Criteria

---

### 3. Criteria Table

Định nghĩa các tiêu chí đánh giá.

```
Field Name     | Type           | Required | Unique | Default | Description
--------------|----------------|----------|--------|---------|------------------
Name          | String         | YES      | YES    | -       | Tên tiêu chí (Design, Performance, Value...)
Description   | Text           | NO       | NO     | -       | Mô tả tiêu chí
Weight        | Number (0-1)   | NO       | NO     | 1       | Trọng số cho tính điểm tổng
is_Active     | Boolean        | NO       | NO     | true    | Đang sử dụng
Order         | Number         | NO       | NO     | 0       | Thứ tự hiển thị
Icon          | String         | NO       | NO     | -       | Icon name (optional)
```

**Relations:**

- Criteria **has many** Ratings
- Criteria **belongs to** Category (optional - tiêu chí theo danh mục)

---

### 4. Identity Table (Updated)

Mở rộng từ schema gốc để hỗ trợ Expert information.

```
Field Name          | Type           | Required | Unique | Default | Description
-------------------|----------------|----------|--------|---------|------------------
// Existing fields
Name               | String         | YES      | NO     | -       | Tên danh tính
Type               | Enum           | NO       | NO     | -       | [Individual, Organization]
Slug               | String         | NO       | YES    | -       | URL slug
Avatar             | Media          | NO       | NO     | -       | Ảnh đại diện

// Contact info
Email              | Email          | NO       | YES    | -       | Email liên hệ
Phone              | String         | NO       | NO     | -       | Số điện thoại
Website            | String         | NO       | NO     | -       | Website cá nhân

// Bio
Bio                | Long Text      | NO       | NO     | -       | Tiểu sử chung

// Expert-specific fields
ExpertCredentials  | Text           | NO       | NO     | -       | Bằng cấp/chứng chỉ
ExpertBio          | Long Text      | NO       | NO     | -       | Tiểu sử chuyên gia
YearsOfExperience  | Number         | NO       | NO     | -       | Số năm kinh nghiệm
Specialization     | String         | NO       | NO     | -       | Chuyên môn
is_VerifiedExpert  | Boolean        | NO       | NO     | false   | Đã verify là chuyên gia
ExpertLevel        | Enum           | NO       | NO     | -       | [Beginner, Intermediate, Advanced, Master]

// User-specific fields
is_VerifiedUser    | Boolean        | NO       | NO     | false   | Đã verify qua blockchain
UserLevel          | Enum           | NO       | NO     | Bronze  | [Bronze, Silver, Gold, Platinum]

// Statistics (calculated)
TotalReviews       | Number         | NO       | NO     | 0       | Tổng số review đã viết
TotalHelpfulVotes  | Number         | NO       | NO     | 0       | Tổng vote helpful nhận được
AvgRating          | Decimal        | NO       | NO     | 0       | Điểm trung bình của reviews
```

**Relations:**

- Identity **has many** Reviews (as Reviewer)
- Identity **has many** Review Votes (as Voter)
- Identity **has many** Reports (as Reporter)

---

### 5. Item Table (Updated)

Thêm fields để lưu aggregated review data.

```
// Existing fields + thêm:

// Review Statistics
ExpertScore        | Decimal        | NO       | NO     | 0       | Điểm TB Expert (0-10)
UserScore          | Decimal        | NO       | NO     | 0       | Điểm TB User (0-10)
OverallScore       | Decimal        | NO       | NO     | 0       | Điểm tổng hợp có trọng số
TotalExpertReviews | Number         | NO       | NO     | 0       | Số review Expert
TotalUserReviews   | Number         | NO       | NO     | 0       | Số review User
TotalReviews       | Number         | NO       | NO     | 0       | Tổng số review

// Review Summary by Criteria (JSON)
CriteriaScores     | JSON           | NO       | NO     | {}      | Điểm TB theo từng tiêu chí
```

**Relations thêm:**

- Item **has many** Reviews

---

### 6. Review Vote Table

Hệ thống vote helpful/unhelpful cho reviews.

```
Field Name     | Type           | Required | Unique | Default | Description
--------------|----------------|----------|--------|---------|------------------
VoteType      | Enum           | YES      | NO     | -       | [Helpful, Unhelpful]
VoteDate      | DateTime       | YES      | NO     | now     | Ngày vote
```

**Relations:**

- Review Vote **belongs to** Review
- Review Vote **belongs to** Identity (Voter)

**Unique Constraint:** [Review, Identity] - 1 người chỉ vote 1 lần cho 1 review

---

### 7. Report Table

Hệ thống báo cáo vi phạm.

```
Field Name     | Type           | Required | Unique | Default | Description
--------------|----------------|----------|--------|---------|------------------
ReportType    | Enum           | YES      | NO     | -       | [Spam, Inappropriate, Fake, Other]
Reason        | Text           | YES      | NO     | -       | Lý do báo cáo chi tiết
Status        | Enum           | YES      | NO     | Pending | [Pending, Reviewing, Resolved, Dismissed]
ReportDate    | DateTime       | YES      | NO     | now     | Ngày báo cáo
AdminNotes    | Text           | NO       | NO     | -       | Ghi chú của admin
ResolvedDate  | DateTime       | NO       | NO     | -       | Ngày xử lý
```

**Relations:**

- Report **belongs to** Review (reportable)
- Report **belongs to** Identity (Reporter)
- Report **belongs to** Identity (Admin/Moderator) - optional

---

## 🔄 Status Workflow

### Review Status Flow

```
Draft → Pending → Published
                → Rejected → Archived (optional)
Published → Archived (when outdated)
```

**Status Definitions:**

- **Draft**: Review đang soạn thảo, chưa submit
- **Pending**: Đã submit, chờ duyệt (User reviews)
- **Published**: Đã được duyệt và hiển thị công khai, tính vào điểm
- **Rejected**: Bị từ chối do vi phạm policy
- **Archived**: Review cũ bị ẩn hoặc sản phẩm ngừng hoạt động

### Business Logic by ReviewType

**Expert Review:**

```
Draft → Published (auto-approve trong MVP)
```

**User Review:**

```
Draft → Pending → Published (manual approve)
                → Rejected (nếu vi phạm)
```

---

## 📊 Score Calculation

### Expert Score

```
ExpertScore = WEIGHTED_AVG(
  expert_ratings.rating * criteria.weight
) WHERE review.reviewType = 'Expert'
  AND review.status = 'Published'
```

### User Score

```
UserScore = WEIGHTED_AVG(
  user_ratings.rating * criteria.weight
) WHERE review.reviewType = 'User'
  AND review.status = 'Published'
  AND review.is_approved = true
```

### Overall Score

```
OverallScore = (ExpertScore * 0.6) + (UserScore * 0.4)
// Có thể điều chỉnh trọng số theo business needs
```

---

## 🎨 Display Format

```
┌─────────────────────────────────────┐
│ iPhone 15 Pro Max                   │
├─────────────────────────────────────┤
│ 🎖️ Expert Score: 8.5/10 (12 reviews) │
│ 👥 User Score: 6.8/10 (847 reviews)  │
│ 📊 Overall: 7.8/10                   │
└─────────────────────────────────────┘

📋 Breakdown by Criteria:
Design:       Expert 9.2/10 | User 7.5/10
Performance:  Expert 8.8/10 | User 6.9/10
Value:        Expert 7.1/10 | User 6.2/10
Build Quality: Expert 8.9/10 | User 7.1/10
```

---

## 🔧 Implementation Notes

### Auto-calculation Triggers

**Khi có Review mới Published:**

1. Recalculate Item scores (Expert/User/Overall)
2. Update Item.TotalReviews counters
3. Update CriteriaScores JSON
4. Update Identity.TotalReviews counter

**Khi có Vote mới:**

1. Update Review.HelpfulVotes (calculated field)
2. Update Identity.TotalHelpfulVotes

**Khi có Report mới:**

1. Update Review.ReportedCount
2. Auto-hide review nếu reports > threshold

### Indexes Needed

```sql
-- Performance indexes
CREATE INDEX idx_reviews_item_status ON reviews(item_id, status);
CREATE INDEX idx_reviews_type_status ON reviews(review_type, status);
CREATE INDEX idx_ratings_review_criteria ON ratings(review_id, criteria_id);
CREATE INDEX idx_votes_review_identity ON review_votes(review_id, identity_id);
```

### Validation Rules

- **Rating**: Must be 1-10
- **ReviewType**: Required, must be 'Expert' or 'User'
- **Status**: Required, must be valid enum value
- **Vote Constraint**: 1 vote per review per user
- **Expert Verification**: Expert reviews chỉ từ is_VerifiedExpert = true

---

## 🚀 Future Enhancements

1. **Blockchain Verification**: Integrate với blockchain cho user verification
2. **AI Moderation**: Auto-detect spam/fake reviews
3. **Review Templates**: Pre-defined criteria sets cho từng category
4. **Video Reviews**: Support video content
5. **Review Responses**: Cho phép brand/seller trả lời reviews
6. **Review Comparison**: So sánh reviews giữa products
7. **Expert Ranking**: Ranking system cho experts
8. **Review Analytics**: Dashboard cho business insights

---

## 📝 Migration Notes

Khi implement:

1. Tạo Criteria defaults (Design, Performance, Value, Build Quality)
2. Migrate existing Identity data nếu có
3. Setup auto-calculation hooks/triggers
4. Configure Status workflow permissions
5. Setup validation rules
6. Create indexes cho performance

---

_Document Version: 1.0_  
_Last Updated: 2024-12-19_  
_Author: Schema Design Team_
