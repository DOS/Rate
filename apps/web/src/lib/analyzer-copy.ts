/**
 * The review analyzer (apps/importer/src/shopee/ai-review-analyzer.ts) stores
 * Vietnamese prose in the database: review flag reasons, the default analysis
 * summary and a default pro; the community review RPCs write two more reasons. The templated ones are recognised here so the UI
 * can show them in the active locale (DOS/Rate#647). Anything else, such as
 * free text written by the LLM pass, is returned as Vietnamese text so the UI
 * can mark its language instead of passing it off as a translation.
 * The Vietnamese messages may word a template more plainly than the stored
 * text (no "seeding", DOS/Rate#656); the patterns below match the stored text.
 */
import { scopeLlmReviewSummary } from '@repo/shared-data/rules';
import { isVietnamese } from './content-lang';

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
  | 'reasonCommunityCoinSpam'
  | 'reasonCommunityAdLink'
  | 'reasonCommunityCompetitor'
  | 'reasonCommunityTooShort'
  | 'reasonCommunityCoinSpamExcluded'
  | 'reasonCommunityAdLinkExcluded'
  | 'reasonCommunityCompetitorExcluded'
  | 'reasonCommunityTooShortExcluded'
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
  // Written since DOS/Rate#1225: the summary speaks for one listing's latest
  // batch, not the product.
  [
    /^Lần phân tích gần nhất \(một nơi bán\) đã xét (?<total>\d+) đánh giá: giữ lại (?<kept>\d+) đánh giá thực chất và loại bỏ (?<removed>\d+) đánh giá rác, nhận xu, ảo hoặc bom hàng\.$/u,
    'summaryDefault',
  ],
  [
    /^Lần phân tích gần nhất \(một nơi bán\) chưa thấy đánh giá thực chất sau khi lọc (?<removed>\d+) bình luận rác\/nhận xu\.$/u,
    'summaryNoAuthentic',
  ],
  // Rows stored before DOS/Rate#1225, read the same way.
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
  [
    /^Phát hiện cụm từ bình luận cày xu mẫu, tự động loại khỏi điểm trung bình JReviews\.$/u,
    'reasonCommunityCoinSpam',
  ],
  [
    /^Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng nghi vấn Seeding\.$/u,
    'reasonCommunityAdLink',
  ],
  [
    /^Nghi vấn bình luận điều hướng sang đối thủ cạnh tranh thiếu bằng chứng trải nghiệm sản phẩm\.$/u,
    'reasonCommunityCompetitor',
  ],
  [
    /^Nội dung quá ngắn, chưa đủ thông tin kiểm chứng trải nghiệm thực tế\.$/u,
    'reasonCommunityTooShort',
  ],
  [
    /^Phát hiện cụm từ bình luận cày xu mẫu, loại khỏi điểm trung bình\.$/u,
    'reasonCommunityCoinSpamExcluded',
  ],
  [
    /^Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng, loại khỏi điểm trung bình\.$/u,
    'reasonCommunityAdLinkExcluded',
  ],
  [
    /^Nghi vấn điều hướng sang đối thủ, loại khỏi điểm trung bình\.$/u,
    'reasonCommunityCompetitorExcluded',
  ],
  [
    /^Nội dung quá ngắn để kiểm chứng trải nghiệm, loại khỏi điểm trung bình\.$/u,
    'reasonCommunityTooShortExcluded',
  ],
  [/^Nhận phản hồi tích cực từ người dùng thực tế$/u, 'proPositiveFeedback'],
];

const MAX_ANALYZER_COPY_LEN = 4_000;

export function analyzerCopy(text: string): AnalyzerCopy {
  if (typeof text !== 'string') return { text: '' };
  const safeText = (
    text.length > MAX_ANALYZER_COPY_LEN
      ? text.slice(0, MAX_ANALYZER_COPY_LEN)
      : text
  )
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalized = safeText.normalize('NFC');
  for (const [pattern, key] of TEMPLATES) {
    const match = pattern.exec(normalized);
    if (match) return { key, values: { ...(match.groups ?? {}) } };
  }
  // Only text that is actually Vietnamese is marked as such.
  return isVietnamese(normalized)
    ? { text: safeText, lang: 'vi' }
    : { text: safeText };
}

export const ANALYZER_COPY_KEYS: readonly AnalyzerCopyKey[] = [
  ...new Set(TEMPLATES.map(([, key]) => key)),
];

// The Vietnamese wording of the review summary, as in vi.json analyzerCopy.
const VI_SUMMARY: Partial<Record<AnalyzerCopyKey, string>> = {
  summaryDefault:
    'Lần phân tích gần nhất (một nơi bán) đã xét {total} đánh giá: giữ lại {kept} đánh giá thực chất và loại bỏ {removed} đánh giá rác, nhận xu, ảo hoặc bom hàng.',
  summaryNoAuthentic:
    'Lần phân tích gần nhất (một nơi bán) chưa thấy đánh giá thực chất sau khi lọc {removed} bình luận rác/nhận xu.',
};

/**
 * The stored review summary as surfaces without a locale (API v1, the
 * extension) print it. A templated summary, old rows included, is reworded
 * to say it covers one listing's latest batch and loses the batch's
 * weighted score, which is not the product's (DOS/Rate#1225). Free text
 * from the LLM pass, old rows included, gets the same one-listing scope
 * prefix, and is not shown (null) when it quotes a score or count
 * (DOS/Rate#1244).
 */
export function listingReviewSummary(
  text: string | null | undefined
): string | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const copy = analyzerCopy(text);
  const template = 'key' in copy ? VI_SUMMARY[copy.key] : undefined;
  if (!template || !('key' in copy)) return scopeLlmReviewSummary(text);
  return template.replace(
    /\{(\w+)\}/g,
    (_, name: string) => copy.values[name] ?? ''
  );
}
