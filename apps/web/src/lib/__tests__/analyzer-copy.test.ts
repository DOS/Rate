import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANALYZER_COPY_KEYS,
  analyzerCopy,
  listingReviewSummary,
} from '../analyzer-copy';
import { LLM_REVIEW_SUMMARY_PREFIX } from '@repo/shared-data/rules';

type Messages = { analyzerCopy?: Record<string, string> };
const readLocale = (locale: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../locales/${locale}.json`, import.meta.url),
      'utf8'
    )
  ) as Messages;
const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '');
const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function main() {
  console.warn('🧪 Analyzer copy suite');
  const vi = readLocale('vi').analyzerCopy!;

  // Strings the analyzer writes (apps/importer/src/shopee/ai-review-analyzer.ts).
  const samples: Array<[string, string]> = [
    ['Đánh giá chi tiết, hợp lệ từ người dùng thực tế.', 'reasonAuthentic'],
    [
      'Phát hiện dấu hiệu đối thủ cạnh tranh không lành mạnh / điều hướng sang nơi bán khác.',
      'reasonSabotage',
    ],
    [
      'Đánh giá khi chưa sử dụng sản phẩm/dịch vụ (hủy đơn hoặc hiệu ứng đám đông).',
      'reasonBombing',
    ],
    [
      'Nội dung văn mẫu seeding trùng lặp giữa 3 tài khoản khác nhau.',
      'reasonDuplicateSeeding',
    ],
    [
      'Nội dung sao chép / xào nấu văn mẫu seeding giữa các tài khoản (tương đồng cấu trúc 68%).',
      'reasonCopiedSeeding',
    ],
    [
      'Chỉ chấm sao, không có nội dung: vẫn tính vào điểm nhưng với trọng số thấp (25% một đánh giá có nội dung).',
      'reasonRatingOnly',
    ],
    [
      'Bình luận mang tính chất nhận xu / chưa trải nghiệm thực tế (được bỏ qua khỏi điểm tổng, không phạt shop).',
      'reasonCoinSpam',
    ],
    [
      'Đánh giá chỉ nhận xét về giao hàng/đóng gói (chuyển về điểm nhà bán, không tính vào điểm sản phẩm).',
      'reasonShippingOnly',
    ],
    [
      'Số sao mâu thuẫn với nội dung nhận xét (nghi vấn chấm nhầm sao hoặc châm biếm, giảm trọng số tin cậy).',
      'reasonContradiction',
    ],
    [
      'Đánh giá bị cộng đồng Vote Down / Báo cáo nhiều nên giảm trọng số về 0.',
      'reasonCommunityDownvoted',
    ],
    [
      'Lần phân tích gần nhất (một nơi bán) đã xét 12 đánh giá: giữ lại 9 đánh giá thực chất và loại bỏ 3 đánh giá rác, nhận xu, ảo hoặc bom hàng.',
      'summaryDefault',
    ],
    [
      'Lần phân tích gần nhất (một nơi bán) chưa thấy đánh giá thực chất sau khi lọc 4 bình luận rác/nhận xu.',
      'summaryNoAuthentic',
    ],
    ['Nhận phản hồi tích cực từ người dùng thực tế', 'proPositiveFeedback'],
    [
      'Đánh giá cộng đồng đang chờ phân tích, chưa được tính vào điểm trung bình.',
      'reasonCommunityPending',
    ],
    [
      'Đánh giá đa tiêu chí từ cộng đồng Rate.vn đạt chuẩn độ dài và chi tiết kỹ thuật.',
      'reasonCommunityAccepted',
    ],
    [
      'Phát hiện cụm từ bình luận cày xu mẫu, tự động loại khỏi điểm trung bình JReviews.',
      'reasonCommunityCoinSpam',
    ],
    [
      'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng nghi vấn Seeding.',
      'reasonCommunityAdLink',
    ],
    [
      'Nghi vấn bình luận điều hướng sang đối thủ cạnh tranh thiếu bằng chứng trải nghiệm sản phẩm.',
      'reasonCommunityCompetitor',
    ],
    [
      'Nội dung quá ngắn, chưa đủ thông tin kiểm chứng trải nghiệm thực tế.',
      'reasonCommunityTooShort',
    ],
    [
      'Phát hiện cụm từ bình luận cày xu mẫu, loại khỏi điểm trung bình.',
      'reasonCommunityCoinSpamExcluded',
    ],
    [
      'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng, loại khỏi điểm trung bình.',
      'reasonCommunityAdLinkExcluded',
    ],
    [
      'Nghi vấn điều hướng sang đối thủ, loại khỏi điểm trung bình.',
      'reasonCommunityCompetitorExcluded',
    ],
    [
      'Nội dung quá ngắn để kiểm chứng trải nghiệm, loại khỏi điểm trung bình.',
      'reasonCommunityTooShortExcluded',
    ],
  ];
  // The stored strings say "seeding"; the UI words these in plain Vietnamese
  // instead (DOS/Rate#656). Their stored templates are kept here so the
  // captured values are still checked against the right placeholders.
  const stored: Partial<Record<string, string>> = {
    reasonDuplicateSeeding:
      'Nội dung văn mẫu seeding trùng lặp giữa {count} tài khoản khác nhau.',
    reasonCopiedSeeding:
      'Nội dung sao chép / xào nấu văn mẫu seeding giữa các tài khoản (tương đồng cấu trúc {pct}%).',
    reasonCommunityAdLink:
      'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng nghi vấn Seeding.',
  };
  const covered = new Set<string>();
  for (const [text, key] of samples) {
    const copy = analyzerCopy(text);
    assert.ok('key' in copy, `not recognised: ${text}`);
    assert.equal(copy.key, key, text);
    // The template rebuilds the stored string exactly, so each captured value
    // lands in the right placeholder.
    const template = stored[copy.key] ?? vi[copy.key]!;
    assert.equal(fill(template, copy.values), text, key);
    if (stored[copy.key]) {
      assert.ok(!/seeding/i.test(vi[copy.key]!), `${key} still says seeding`);
      assert.deepEqual(
        placeholders(vi[copy.key]!),
        placeholders(template),
        `${key} uses every value the stored string carries`
      );
    }
    covered.add(copy.key);
  }
  assert.deepEqual(
    [...covered].sort(),
    [...ANALYZER_COPY_KEYS].sort(),
    'every template has a sample'
  );

  // Summaries stored before DOS/Rate#1225 still read; the batch's weighted
  // score, which is not the product's, is left out.
  const legacy: Array<[string, string, string]> = [
    [
      'Đã phân tích 10 đánh giá: giữ lại 10 đánh giá thực chất (điểm JReviews có trọng số: 5/5★) và loại bỏ 0 đánh giá rác/nhận xu/seeding/bom hàng khỏi điểm tổng.',
      'summaryDefault',
      'Lần phân tích gần nhất (một nơi bán) đã xét 10 đánh giá: giữ lại 10 đánh giá thực chất và loại bỏ 0 đánh giá rác, nhận xu, ảo hoặc bom hàng.',
    ],
    [
      'Đã phân tích 12 đánh giá: giữ lại 9 đánh giá thực chất (điểm JReviews có trọng số: 4.37/5★) và loại bỏ 3 đánh giá rác/nhận xu/seeding/bom hàng khỏi điểm tổng.',
      'summaryDefault',
      'Lần phân tích gần nhất (một nơi bán) đã xét 12 đánh giá: giữ lại 9 đánh giá thực chất và loại bỏ 3 đánh giá rác, nhận xu, ảo hoặc bom hàng.',
    ],
    [
      'Chưa có đánh giá thực chất sau khi lọc 4 bình luận rác/nhận xu.',
      'summaryNoAuthentic',
      'Lần phân tích gần nhất (một nơi bán) chưa thấy đánh giá thực chất sau khi lọc 4 bình luận rác/nhận xu.',
    ],
  ];
  for (const [text, key, reworded] of legacy) {
    const copy = analyzerCopy(text);
    assert.ok('key' in copy && copy.key === key, text);
    assert.equal(fill(vi[key]!, copy.values), reworded, key);
    assert.equal(listingReviewSummary(text), reworded, key);
  }
  // API v1 and the extension print the same words as the web page; new rows
  // pass through unchanged, free text and empty values too.
  for (const [text, key] of samples.filter(([, k]) =>
    k.startsWith('summary')
  )) {
    assert.equal(listingReviewSummary(text), text, key);
  }
  for (const [text] of legacy) {
    assert.ok(!/Đã phân tích|trọng số/.test(listingReviewSummary(text)!));
  }
  // LLM free text (DOS/Rate#1244): old rows get the one-listing scope; a
  // summary quoting a score, a share or a count is not shown at all.
  assert.equal(
    listingReviewSummary('Máy dùng ổn.'),
    `${LLM_REVIEW_SUMMARY_PREFIX}Máy dùng ổn.`
  );
  const scoped = `${LLM_REVIEW_SUMMARY_PREFIX}Pin tốt, giao nhanh.`;
  assert.equal(listingReviewSummary(scoped), scoped, 'scoped once');
  for (const claim of [
    'Sản phẩm đạt 4.8/5 sao, người mua rất hài lòng.',
    'Điểm JReviews có trọng số 4,6 cho thấy chất lượng tốt.',
    '95% người mua khen pin.',
    'Có 120 đánh giá khen camera.',
    'Rated 4.7 out of 5 by buyers.',
    `${LLM_REVIEW_SUMMARY_PREFIX}Điểm trung bình rất cao.`,
  ]) {
    assert.equal(listingReviewSummary(claim), null, claim);
  }
  assert.equal(listingReviewSummary(null), null);
  assert.equal(listingReviewSummary('  '), null);

  // Free text (e.g. from the LLM pass) is passed through as Vietnamese.
  const free =
    'Pin trâu, camera chụp đêm tốt nhưng máy hơi nóng khi chơi game.';
  assert.deepEqual(analyzerCopy(free), { text: free, lang: 'vi' });
  // Text that is not Vietnamese is not labelled as Vietnamese.
  assert.deepEqual(analyzerCopy('Battery lasts all day.'), {
    text: 'Battery lasts all day.',
  });
  assert.ok(
    'text' in
      analyzerCopy('Đánh giá chi tiết, hợp lệ từ người dùng thực tế. Thêm')
  );

  // The fixed strings still exist where they are written (the analyzer and the
  // community review RPCs), so a wording change there fails here instead of
  // silently falling back to Vietnamese.
  const analyzerSrc = [
    '../../../../importer/src/shopee/ai-review-analyzer.ts',
    '../../../../../supabase/migrations/20261014234500_rate_community_review_submission_rpc.sql',
    '../../../../../supabase/migrations/20261018100000_rate_community_review_auth_gate.sql',
  ]
    .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
    .join('\n');
  // Every literal piece of each stored string, not just its start.
  for (const [text, key] of samples) {
    for (const piece of text.split(/\d+(?:\.\d+)?/).filter(Boolean)) {
      assert.ok(
        analyzerSrc.includes(piece),
        `${key} no longer matches the analyzer source: ${piece}`
      );
    }
  }

  // Every key exists in every locale with the same placeholders.
  for (const locale of ['en', 'cs']) {
    const messages = readLocale(locale).analyzerCopy ?? {};
    for (const key of [...ANALYZER_COPY_KEYS, 'originalVietnamese']) {
      assert.ok(messages[key], `${locale}.analyzerCopy.${key} is missing`);
      assert.deepEqual(
        placeholders(messages[key]!),
        placeholders(vi[key]!),
        `${locale}.analyzerCopy.${key} placeholders`
      );
    }
  }

  // Non-string & oversized input bounds (#854)
  assert.deepEqual(analyzerCopy(null as unknown as string), { text: '' });
  const oversized = analyzerCopy('Đ' + 'a'.repeat(5_000));
  assert.ok('text' in oversized && oversized.text.length === 4_000);
  assert.equal('text' in oversized ? oversized.lang : undefined, 'vi');

  console.warn('✅ Analyzer copy suite passed');
}

main();
