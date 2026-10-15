-- =============================================================================
-- Migration: 20261014234500_rate_community_review_submission_rpc.sql
-- Purpose:
--   1. Provide an idempotent SECURITY DEFINER RPC `rate.submit_community_review`
--      allowing users on Rate.vn to submit multi-criteria JReviews evaluations
--      (screen, performance, camera, battery, value) with built-in anti-spam
--      and anti-seeding classification into `rate.reviews` + `rate.review_flags`.
-- =============================================================================

CREATE OR REPLACE FUNCTION rate.submit_community_review(
  p_master_product_id UUID,
  p_author_name TEXT,
  p_rating_star INTEGER,
  p_comment TEXT,
  p_variation TEXT DEFAULT NULL,
  p_reviewer_type TEXT DEFAULT 'user',
  p_criteria_ratings JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rate, public, pg_temp
AS $$
DECLARE
  v_product_id UUID;
  v_review_id UUID;
  v_clean_author TEXT;
  v_clean_comment TEXT;
  v_clean_type TEXT;
  v_clean_criteria JSONB;
  v_comment_len INTEGER;
  v_verdict TEXT := 'authentic';
  v_flag_category TEXT := 'authentic';
  v_fake_prob NUMERIC(4,3) := 0.050;
  v_include BOOLEAN := true;
  v_weight NUMERIC(5,2) := 1.00;
  v_reason TEXT := 'Đánh giá đa tiêu chí từ cộng đồng Rate.vn đạt chuẩn độ dài và chi tiết kỹ thuật.';
  v_signals JSONB;
BEGIN
  IF p_master_product_id IS NULL THEN
    RAISE EXCEPTION 'master_product_id is required' USING ERRCODE = '22023';
  END IF;

  v_clean_author := left(btrim(COALESCE(p_author_name, '')), 80);
  IF char_length(v_clean_author) < 2 THEN
    v_clean_author := 'Người dùng Rate.vn';
  END IF;

  v_clean_comment := btrim(COALESCE(p_comment, ''));
  v_comment_len := char_length(v_clean_comment);
  IF v_comment_len < 15 OR v_comment_len > 3000 THEN
    RAISE EXCEPTION 'Nội dung đánh giá phải từ 15 đến 3000 ký tự' USING ERRCODE = '22023';
  END IF;

  IF p_rating_star IS NULL OR p_rating_star < 1 OR p_rating_star > 5 THEN
    RAISE EXCEPTION 'Số sao đánh giá phải từ 1 đến 5' USING ERRCODE = '22023';
  END IF;

  -- Only service_role may submit 'expert' reviews; anon/authenticated are forced to 'user'
  v_clean_type := CASE
    WHEN p_reviewer_type = 'expert'
      AND (
        COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        OR session_user = 'service_role'
      )
    THEN 'expert'
    ELSE 'user'
  END;

  v_clean_criteria := CASE
    WHEN p_criteria_ratings IS NOT NULL AND jsonb_typeof(p_criteria_ratings) = 'object'
    THEN p_criteria_ratings
    ELSE '{}'::jsonb
  END;

  -- Locate primary listing for this master product
  SELECT id INTO v_product_id
  FROM rate.products
  WHERE cluster_id = p_master_product_id
  ORDER BY price_current ASC NULLS LAST, created_at ASC
  LIMIT 1;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy listing liên kết cho sản phẩm chuẩn hóa này' USING ERRCODE = 'P0002';
  END IF;

  -- Built-in heuristic classification for coin-spam & seeding patterns
  IF v_clean_comment ~* '(nhận xu|kiếm xu|lấy xu|comment lấy xu|hình ảnh chỉ mang tính chất|video chỉ mang tính chất)' THEN
    v_verdict := 'suspicious';
    v_flag_category := 'low_value_coin_spam';
    v_fake_prob := 0.850;
    v_include := false;
    v_weight := 0.00;
    v_reason := 'Phát hiện cụm từ bình luận cày xu mẫu, tự động loại khỏi điểm trung bình JReviews.';
  ELSIF v_clean_comment ~* '(inbox zalo|liên hệ zalo|nhắn zalo|http://|https://|shopee\.ee|s\.shopee)' THEN
    v_verdict := 'fake';
    v_flag_category := 'seeding_fake';
    v_fake_prob := 0.920;
    v_include := false;
    v_weight := 0.00;
    v_reason := 'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng nghi vấn Seeding.';
  ELSIF p_rating_star <= 2 AND v_clean_comment ~* '(shop lừa đảo sang shop|mua bên shop khác tốt hơn|đừng mua shop này qua shop)' THEN
    v_verdict := 'suspicious';
    v_flag_category := 'competitor_sabotage';
    v_fake_prob := 0.780;
    v_include := false;
    v_weight := 0.00;
    v_reason := 'Nghi vấn bình luận điều hướng sang đối thủ cạnh tranh thiếu bằng chứng trải nghiệm sản phẩm.';
  ELSIF v_comment_len < 30 THEN
    v_verdict := 'suspicious';
    v_flag_category := 'low_value_coin_spam';
    v_fake_prob := 0.650;
    v_include := false;
    v_weight := 0.00;
    v_reason := 'Nội dung quá ngắn, chưa đủ thông tin kiểm chứng trải nghiệm thực tế.';
  END IF;

  v_signals := jsonb_build_object(
    'language_marker_score', v_fake_prob,
    'reviewer_history_score', CASE WHEN v_include THEN 0.90 ELSE 0.20 END,
    'account_age_bucket', 'medium'
  );

  INSERT INTO rate.reviews (
    product_id,
    platform_review_id,
    author_name,
    rating_star,
    comment,
    variation,
    reviewer_type,
    criteria_ratings,
    upvotes,
    downvotes,
    report_count,
    helpfulness_weight
  )
  VALUES (
    v_product_id,
    'rate_comm_' || replace(gen_random_uuid()::text, '-', ''),
    v_clean_author,
    p_rating_star::smallint,
    v_clean_comment,
    NULLIF(left(btrim(COALESCE(p_variation, '')), 120), ''),
    v_clean_type,
    v_clean_criteria,
    0,
    0,
    0,
    v_weight
  )
  RETURNING id INTO v_review_id;

  INSERT INTO rate.review_flags (
    review_id,
    verdict,
    fake_probability,
    flag_category,
    include_in_rating,
    reason,
    signals,
    detector,
    detector_version,
    input_hash
  )
  VALUES (
    v_review_id,
    v_verdict,
    v_fake_prob,
    v_flag_category,
    v_include,
    v_reason,
    v_signals,
    'rate-jreviews-guard',
    'v1',
    rate.review_input_hash(v_clean_author, p_rating_star::smallint, v_clean_comment)
  );

  -- Refresh master product weighted user rating & authentic review count
  PERFORM rate.refresh_master_product_rating(p_master_product_id);

  RETURN jsonb_build_object(
    'id', v_review_id,
    'product_id', v_product_id,
    'author_name', v_clean_author,
    'rating_star', p_rating_star,
    'comment', v_clean_comment,
    'variation', NULLIF(left(btrim(COALESCE(p_variation, '')), 120), ''),
    'reviewer_type', v_clean_type,
    'criteria_ratings', v_clean_criteria,
    'verdict', v_verdict,
    'flag_category', v_flag_category,
    'fake_probability', v_fake_prob,
    'include_in_rating', v_include,
    'helpfulness_weight', v_weight,
    'reason', v_reason,
    'created_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION rate.submit_community_review(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rate.submit_community_review(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB)
  TO anon, authenticated, service_role;
