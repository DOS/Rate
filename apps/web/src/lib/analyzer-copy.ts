/**
 * The review analyzer (apps/importer/src/shopee/ai-review-analyzer.ts) stores
 * Vietnamese prose in the database: review flag reasons, the default analysis
 * summary and a default pro; the community review RPCs write two more reasons. The templated ones are recognised here so the UI
 * can show them in the active locale (DOS/Rate#647). Anything else, such as
 * free text written by the LLM pass, is returned as Vietnamese text so the UI
 * can mark its language instead of passing it off as a translation.
 */

export type AnalyzerCopyKey =
  | 'reasonAuthentic'
  | 'reasonSabotage'
  | 'reasonBombing'
  | 'reasonDuplicateSeeding'
  | 'reasonCopiedSeeding'
  | 'reasonRatingOnly'
  | 'reasonCoinSpam'
  | 'reasonShippingOnly'
  | 'reasonContradiction'
  | 'reasonCommunityDownvoted'
  | 'reasonCommunityPending'
  | 'reasonCommunityAccepted'
  | 'summaryDefault'
  | 'summaryNoAuthentic'
  | 'proPositiveFeedback';

export type AnalyzerCopy =
  | { key: AnalyzerCopyKey; values: Record<string, string> }
  | { text: string; lang?: 'vi' };

// Each pattern mirrors one string the analyzer writes; named groups become
// message values. Keep in sync with ai-review-analyzer.ts.
const TEMPLATES: ReadonlyArray<readonly [RegExp, AnalyzerCopyKey]> = [
  [/^Đánh giá chi tiết, hợp lệ từ người dùng thực tế\.$/u, 'reasonAuthentic'],
  [
    /^Phát hiện dấu hiệu đối thủ cạnh tranh không lành mạnh \/ điều hướng sang nơi bán khác\.$/u,
    'reasonSabotage',
  ],
  [
    /^Đánh giá khi chưa sử dụng sản phẩm\/dịch vụ \(hủy đơn hoặc hiệu ứng đám đông\)\.$/u,
    'reasonBombing',
  ],
  [
    /^Nội dung văn mẫu seeding trùng lặp giữa (?<count>\d+) tài khoản khác nhau\.$/u,
    'reasonDuplicateSeeding',
  ],
  [
    /^Nội dung sao chép \/ xào nấu văn mẫu seeding giữa các tài khoản \(tương đồng cấu trúc (?<pct>\d+)%\)\.$/u,
    'reasonCopiedSeeding',
  ],
  [
    /^Chỉ chấm sao, không có nội dung: vẫn tính vào điểm nhưng với trọng số thấp \(25% một đánh giá có nội dung\)\.$/u,
    'reasonRatingOnly',
  ],
  [
    /^Bình luận mang tính chất nhận xu \/ chưa trải nghiệm thực tế \(được bỏ qua khỏi điểm tổng, không phạt shop\)\.$/u,
    'reasonCoinSpam',
  ],
  [
    /^Đánh giá chỉ nhận xét về giao hàng\/đóng gói \(chuyển về điểm nhà bán, không tính vào điểm sản phẩm\)\.$/u,
    'reasonShippingOnly',
  ],
  [
    /^Số sao mâu thuẫn với nội dung nhận xét \(nghi vấn chấm nhầm sao hoặc châm biếm, giảm trọng số tin cậy\)\.$/u,
    'reasonContradiction',
  ],
  [
    /^Đánh giá bị cộng đồng Vote Down \/ Báo cáo nhiều nên giảm trọng số về 0\.$/u,
    'reasonCommunityDownvoted',
  ],
  [
    /^Đã phân tích (?<total>\d+) đánh giá: giữ lại (?<kept>\d+) đánh giá thực chất \(điểm JReviews có trọng số: (?<rating>\d+(?:\.\d+)?)\/5★\) và loại bỏ (?<removed>\d+) đánh giá rác\/nhận xu\/seeding\/bom hàng khỏi điểm tổng\.$/u,
    'summaryDefault',
  ],
  [
    /^Chưa có đánh giá thực chất sau khi lọc (?<removed>\d+) bình luận rác\/nhận xu\.$/u,
    'summaryNoAuthentic',
  ],
  // Written by the community review RPCs in supabase/migrations.
  [
    /^Đánh giá cộng đồng đang chờ phân tích, chưa được tính vào điểm trung bình\.$/u,
    'reasonCommunityPending',
  ],
  [
    /^Đánh giá đa tiêu chí từ cộng đồng Rate\.vn đạt chuẩn độ dài và chi tiết kỹ thuật\.$/u,
    'reasonCommunityAccepted',
  ],
  [/^Nhận phản hồi tích cực từ người dùng thực tế$/u, 'proPositiveFeedback'],
];

const VIETNAMESE_RE =
  /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu;

export function analyzerCopy(text: string): AnalyzerCopy {
  const normalized = text.normalize('NFC').trim();
  for (const [pattern, key] of TEMPLATES) {
    const match = pattern.exec(normalized);
    if (match) return { key, values: { ...(match.groups ?? {}) } };
  }
  // Only text that is actually Vietnamese is marked as such.
  return VIETNAMESE_RE.test(normalized) ? { text, lang: 'vi' } : { text };
}

export const ANALYZER_COPY_KEYS: readonly AnalyzerCopyKey[] = TEMPLATES.map(
  ([, key]) => key
);
