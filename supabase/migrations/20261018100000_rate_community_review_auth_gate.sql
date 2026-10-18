-- =============================================================================
-- Migration: 20261018100000_rate_community_review_auth_gate.sql
-- Purpose: close the anonymous rating-manipulation path opened by
--   20261014234500_rate_community_review_submission_rpc.sql before it is
--   promoted to production.
--
--   1. Only signed-in users (or service_role) may call
--      rate.submit_community_review. anon loses EXECUTE.
--   2. Every community review is bound to the submitting auth user in the
--      private table rate.review_authors (no anon/authenticated access, so
--      reviewers cannot be deanonymized through the public rate.reviews read)
--      and rate-limited server-side: one review per user per master product,
--      at most 5 per rolling 24h. Supabase anonymous sign-ins are rejected.
--   3. Community reviews never count toward the weighted rating at submit
--      time. They are stored as verdict 'unanalyzed' with
--      include_in_rating = false and helpfulness_weight = 0. Votes cannot
--      lift that; only an analyzer that explicitly sets include_in_rating
--      can. Keyword-rule hits stay excluded.
--   4. No unmeasured detector signals are written: signals is '{}' and
--      fake_probability is NULL. The previous version wrote fixed
--      reviewer_history_score / account_age_bucket values it never measured.
--   5. is_verified_buyer is NULL (unknown) instead of the column default true.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION with the same signature, explicit grants.
-- =============================================================================

CREATE TABLE IF NOT EXISTS rate.review_authors (
  review_id UUID PRIMARY KEY REFERENCES rate.reviews(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rate.review_authors IS
  'Private binding of community reviews to the submitting auth user. Never exposed to anon/authenticated: rate.reviews is public-read and user ids are shared across DOS products.';

CREATE INDEX IF NOT EXISTS idx_rate_review_authors_user_created
  ON rate.review_authors (author_user_id, created_at DESC)
  WHERE author_user_id IS NOT NULL;

ALTER TABLE rate.review_authors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate.review_authors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON rate.review_authors TO service_role;

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
  v_uid UUID := auth.uid();
  v_claims JSONB := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_claim_role TEXT := COALESCE(v_claims ->> 'role', '');
  v_is_service BOOLEAN;
  v_product_id UUID;
  v_review_id UUID;
  v_created_at TIMESTAMPTZ;
  v_clean_author TEXT;
  v_clean_comment TEXT;
  v_clean_variation TEXT;
  v_clean_type TEXT;
  v_clean_criteria JSONB;
  v_comment_len INTEGER;
  v_recent INTEGER;
  v_verdict TEXT := 'unanalyzed';
  v_flag_category TEXT := NULL;
  v_reason TEXT := 'Đánh giá cộng đồng đang chờ phân tích, chưa được tính vào điểm trung bình.';
BEGIN
  v_is_service := v_claim_role = 'service_role';

  -- Fail closed: anonymous callers are rejected even if EXECUTE is ever
  -- re-granted by mistake.
  IF v_uid IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để gửi đánh giá' USING ERRCODE = '42501';
  END IF;

  -- Supabase anonymous sign-ins mint role=authenticated users at will, which
  -- would make the per-user limits below meaningless.
  IF NOT v_is_service AND COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật để gửi đánh giá' USING ERRCODE = '42501';
  END IF;

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

  -- Only service_role may submit 'expert' reviews; everyone else is 'user'.
  v_clean_type := CASE
    WHEN p_reviewer_type = 'expert' AND v_is_service THEN 'expert'
    ELSE 'user'
  END;

  v_clean_criteria := CASE
    WHEN p_criteria_ratings IS NOT NULL AND jsonb_typeof(p_criteria_ratings) = 'object'
    THEN p_criteria_ratings
    ELSE '{}'::jsonb
  END;

  v_clean_variation := NULLIF(left(btrim(COALESCE(p_variation, '')), 120), '');

  SELECT id INTO v_product_id
  FROM rate.products
  WHERE cluster_id = p_master_product_id
  ORDER BY price_current ASC NULLS LAST, created_at ASC
  LIMIT 1;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy listing liên kết cho sản phẩm chuẩn hóa này' USING ERRCODE = 'P0002';
  END IF;

  IF v_uid IS NOT NULL THEN
    -- Serialize submissions per user so the checks below cannot be raced.
    PERFORM pg_advisory_xact_lock(
      hashtextextended('rate.submit_community_review:' || v_uid::text, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM rate.review_authors a
      JOIN rate.reviews r ON r.id = a.review_id
      JOIN rate.products p ON p.id = r.product_id
      WHERE a.author_user_id = v_uid
        AND p.cluster_id = p_master_product_id
    ) THEN
      RAISE EXCEPTION 'Bạn đã gửi đánh giá cho sản phẩm này' USING ERRCODE = '23505';
    END IF;

    SELECT count(*) INTO v_recent
    FROM rate.review_authors
    WHERE author_user_id = v_uid
      AND created_at > now() - interval '24 hours';

    IF v_recent >= 5 THEN
      RAISE EXCEPTION 'Bạn đã gửi quá 5 đánh giá trong 24 giờ, vui lòng thử lại sau' USING ERRCODE = '54000';
    END IF;
  END IF;

  -- Keyword rules only decide exclusion. Nothing is ever included at submit
  -- time; inclusion is the analyzer's decision.
  IF v_clean_comment ~* '(nhận xu|kiếm xu|lấy xu|comment lấy xu|hình ảnh chỉ mang tính chất|video chỉ mang tính chất)' THEN
    v_verdict := 'suspicious';
    v_flag_category := 'low_value_coin_spam';
    v_reason := 'Phát hiện cụm từ bình luận cày xu mẫu, loại khỏi điểm trung bình.';
  ELSIF v_clean_comment ~* '(inbox zalo|liên hệ zalo|nhắn zalo|http://|https://|shopee\.ee|s\.shopee)' THEN
    v_verdict := 'suspicious';
    v_flag_category := 'seeding_fake';
    v_reason := 'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng, loại khỏi điểm trung bình.';
  ELSIF p_rating_star <= 2 AND v_clean_comment ~* '(shop lừa đảo sang shop|mua bên shop khác tốt hơn|đừng mua shop này qua shop)' THEN
    v_verdict := 'suspicious';
    v_flag_category := 'competitor_sabotage';
    v_reason := 'Nghi vấn điều hướng sang đối thủ, loại khỏi điểm trung bình.';
  ELSIF v_comment_len < 30 THEN
    v_verdict := 'suspicious';
    v_flag_category := 'low_value_coin_spam';
    v_reason := 'Nội dung quá ngắn để kiểm chứng trải nghiệm, loại khỏi điểm trung bình.';
  END IF;

  INSERT INTO rate.reviews (
    product_id,
    platform_review_id,
    author_name,
    rating_star,
    comment,
    variation,
    is_verified_buyer,
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
    v_clean_variation,
    NULL,
    v_clean_type,
    v_clean_criteria,
    0,
    0,
    0,
    0.00
  )
  RETURNING id, created_at INTO v_review_id, v_created_at;

  IF v_uid IS NOT NULL THEN
    INSERT INTO rate.review_authors (review_id, author_user_id)
    VALUES (v_review_id, v_uid);
  END IF;

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
    NULL,
    v_flag_category,
    false,
    v_reason,
    '{}'::jsonb,
    'rate-community-guard',
    'v2',
    rate.review_input_hash(v_clean_author, p_rating_star::smallint, v_clean_comment)
  );

  -- No rating refresh: an excluded review cannot change the weighted rating.

  RETURN jsonb_build_object(
    'id', v_review_id,
    'product_id', v_product_id,
    'author_name', v_clean_author,
    'rating_star', p_rating_star,
    'comment', v_clean_comment,
    'variation', v_clean_variation,
    'reviewer_type', v_clean_type,
    'criteria_ratings', v_clean_criteria,
    'verdict', v_verdict,
    'flag_category', v_flag_category,
    'fake_probability', NULL,
    'include_in_rating', false,
    'helpfulness_weight', 0,
    'reason', v_reason,
    'created_at', v_created_at
  );
END;
$$;

-- CREATE OR REPLACE keeps existing privileges, so the anon grant from
-- 20261014234500 must be revoked explicitly.
REVOKE ALL ON FUNCTION rate.submit_community_review(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rate.submit_community_review(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;
