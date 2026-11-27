-- =============================================================================
-- Migration: 20261210160000_rate_review_edit_delete_and_seller_reply.sql
-- Purpose (DOS/DOS.Me#1997, DOS/Rate#1941): add community review edit/delete
-- support, authorship check RPC, and seller reply columns on rate.reviews.
--
-- What it adds / updates:
--   1. Columns on rate.reviews:
--      - edited_at TIMESTAMPTZ
--      - seller_reply TEXT (length <= 5000 via rate_reviews_seller_reply_len_chk)
--      - seller_reply_at TIMESTAMPTZ
--   2. rate.review_deleted_submissions:
--      Private table preserving deleted community review submission timestamps
--      for the 5-per-24h anti-spam quota when a user deletes a review.
--   3. rate.my_review_ids(p_review_ids uuid[]):
--      SECURITY DEFINER RPC returning the caller's own community review IDs
--      without exposing rate.review_authors.author_user_id (authenticated only).
--   4. rate.edit_community_review(...):
--      Author-only SECURITY DEFINER RPC that updates an existing community
--      review (enforcing v2 criteria/verdict/pros/cons rules whenever the
--      product's category has rating_criteria or the review is already v2, and
--      legacy star+comment rules only when neither applies), sets edited_at,
--      resets helpfulness_weight/value_tier/review_values/review_flags, and
--      refreshes master product ratings under a per-master advisory lock.
--   5. rate.delete_community_review(p_review_id uuid):
--      Author-only SECURITY DEFINER RPC that records the 24h quota slot,
--      deletes the caller's community review (cascading dependent rows), and
--      refreshes master product ratings under a per-master advisory lock.
--   6. rate.submit_community_review, rate.submit_community_review_v2, and
--      rate.store_review_values:
--      - Include rate.review_deleted_submissions in the 5-per-24h quota.
--      - Allow optional edited_at optimistic guard in rate.store_review_values
--        so stale scoring batches never overwrite an edited review's score/tier.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, guarded
-- pg_constraint creation with post-commit VALIDATE CONSTRAINT, CREATE OR
-- REPLACE FUNCTION, and explicit REVOKE/GRANT ACLs.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Columns and length constraint on rate.reviews -----------------------------

ALTER TABLE rate.reviews
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seller_reply TEXT,
  ADD COLUMN IF NOT EXISTS seller_reply_at TIMESTAMPTZ;

COMMENT ON COLUMN rate.reviews.edited_at IS
  'Timestamp when the community review author last edited this review.';
COMMENT ON COLUMN rate.reviews.seller_reply IS
  'Official seller reply imported from the marketplace or submitted by verified seller.';
COMMENT ON COLUMN rate.reviews.seller_reply_at IS
  'Timestamp of the seller reply.';

DO $seller_reply_chk$
DECLARE
  v_condef text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(c.oid)
  INTO v_condef
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'rate.reviews'::pg_catalog.regclass
    AND c.conname = 'rate_reviews_seller_reply_len_chk'
    AND c.contype = 'c';

  IF v_condef IS DISTINCT FROM 'CHECK (((seller_reply IS NULL) OR (char_length(seller_reply) <= 5000)))'
     AND v_condef IS DISTINCT FROM 'CHECK (((seller_reply IS NULL) OR (char_length(seller_reply) <= 5000))) NOT VALID' THEN
    IF v_condef IS NOT NULL THEN
      ALTER TABLE rate.reviews
        DROP CONSTRAINT rate_reviews_seller_reply_len_chk;
    END IF;

    ALTER TABLE rate.reviews
      ADD CONSTRAINT rate_reviews_seller_reply_len_chk
      CHECK (seller_reply IS NULL OR pg_catalog.char_length(seller_reply) <= 5000) NOT VALID;
  END IF;
END
$seller_reply_chk$;

-- 2. Private 24h deletion quota ledger ----------------------------------------

CREATE TABLE IF NOT EXISTS rate.review_deleted_submissions (
  review_id uuid PRIMARY KEY,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE rate.review_deleted_submissions IS
  'Private 24h submission quota ledger for deleted community reviews so delete+resubmit cannot bypass the 5/24h cap.';

CREATE INDEX IF NOT EXISTS idx_rate_review_deleted_submissions_user_submitted
  ON rate.review_deleted_submissions (author_user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_review_deleted_submissions_submitted
  ON rate.review_deleted_submissions (submitted_at);

ALTER TABLE rate.review_deleted_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE rate.review_deleted_submissions
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker;
GRANT SELECT ON TABLE rate.review_deleted_submissions TO service_role;

DROP POLICY IF EXISTS "Service role access review_deleted_submissions" ON rate.review_deleted_submissions;
CREATE POLICY "Service role access review_deleted_submissions" ON rate.review_deleted_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION rate.purge_deleted_review_submissions(
  p_older_than interval DEFAULT interval '24 hours',
  p_batch_limit integer DEFAULT 500
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM rate.review_deleted_submissions
  WHERE review_id IN (
    SELECT d.review_id
    FROM rate.review_deleted_submissions d
    WHERE d.submitted_at <= pg_catalog.now() - p_older_than
    ORDER BY d.submitted_at ASC
    LIMIT LEAST(GREATEST(COALESCE(p_batch_limit, 500), 1), 5000)
    FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION rate.purge_deleted_review_submissions(interval, integer)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
GRANT EXECUTE ON FUNCTION rate.purge_deleted_review_submissions(interval, integer)
  TO service_role;

-- 3. rate.my_review_ids (authenticated only) ----------------------------------

CREATE OR REPLACE FUNCTION rate.my_review_ids(p_review_ids uuid[])
RETURNS TABLE (review_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_claims jsonb := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL OR COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật' USING ERRCODE = '42501';
  END IF;

  IF p_review_ids IS NULL OR pg_catalog.cardinality(p_review_ids) = 0 THEN
    RETURN;
  END IF;

  IF COALESCE(pg_catalog.array_ndims(p_review_ids), 1) > 1 THEN
    RAISE EXCEPTION 'p_review_ids must be a 1-D uuid array' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.cardinality(p_review_ids) > 200 THEN
    RAISE EXCEPTION 'at most 200 review ids per call' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT a.review_id
  FROM rate.review_authors a
  JOIN rate.reviews r ON r.id = a.review_id
  WHERE a.review_id = ANY (p_review_ids)
    AND a.author_user_id = v_uid
    AND r.origin = 'community';
END;
$$;

REVOKE ALL ON FUNCTION rate.my_review_ids(uuid[])
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
GRANT EXECUTE ON FUNCTION rate.my_review_ids(uuid[])
  TO authenticated;

-- 4. rate.edit_community_review -----------------------------------------------

CREATE OR REPLACE FUNCTION rate.edit_community_review(
  p_review_id uuid,
  p_criteria_ratings jsonb DEFAULT NULL,
  p_verdict text DEFAULT NULL,
  p_pros jsonb DEFAULT NULL,
  p_cons jsonb DEFAULT NULL,
  p_comment text DEFAULT NULL,
  p_variation text DEFAULT NULL,
  p_rating_star integer DEFAULT NULL,
  p_criterion_points jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_claims jsonb := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_probe record;
  v_review record;
  v_master_id uuid;
  v_category text;
  v_version integer;
  v_criterion record;
  v_value jsonb;
  v_star numeric;
  v_clean_criteria jsonb := '{}'::jsonb;
  v_weighted numeric := 0;
  v_weights integer := 0;
  v_skipped integer := 0;
  v_rating_exact numeric(2, 1);
  v_rating_star smallint;
  v_verdict text;
  v_verdict_len integer;
  v_pros text[];
  v_cons text[];
  v_key text;
  v_points jsonb;
  v_cr_pros text[];
  v_cr_cons text[];
  v_criterion_lines jsonb := '[]'::jsonb;
  v_comment text;
  v_comment_len integer;
  v_criterion_points_text text;
  v_all_text text;
  v_clean_variation text;
  v_line_count integer := 0;
  v_i integer;
  v_flag_verdict text := 'unanalyzed';
  v_flag_category text := NULL;
  v_reason text := 'Đánh giá cộng đồng đang chờ phân tích, chưa được tính vào điểm trung bình.';
  v_edited_at timestamptz;
BEGIN
  IF v_uid IS NULL OR COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật để chỉnh sửa đánh giá'
      USING ERRCODE = '42501';
  END IF;

  IF p_review_id IS NULL THEN
    RAISE EXCEPTION 'review_id is required'
      USING ERRCODE = '22023', DETAIL = 'review_id';
  END IF;

  IF p_criteria_ratings IS NOT NULL
     AND jsonb_typeof(p_criteria_ratings) = 'object'
     AND (SELECT pg_catalog.count(*) FROM jsonb_object_keys(p_criteria_ratings)) > 32 THEN
    RAISE EXCEPTION 'Tiêu chí đánh giá không hợp lệ'
      USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;

  -- Serialize review writes per user (shared lock key with submit_community_review[_v2]).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rate.submit_community_review:' || v_uid::text, 0)
  );

  -- Only expose public review origins ('crawl', 'community') so hidden rows
  -- (synthetic, fixture, seed, backfill) return the same P0002 as missing IDs.
  SELECT r.id, r.origin, p.cluster_id
  INTO v_probe
  FROM rate.reviews r
  LEFT JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id
    AND r.origin IN ('crawl', 'community');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đánh giá'
      USING ERRCODE = 'P0002', DETAIL = 'review_id';
  END IF;

  IF v_probe.origin IS DISTINCT FROM 'community'
     OR NOT EXISTS (
       SELECT 1
       FROM rate.review_authors a
       WHERE a.review_id = p_review_id
         AND a.author_user_id = v_uid
     ) THEN
    RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa đánh giá này'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the review (non-key update so concurrent vote FK checks do not deadlock)
  -- and its listing row before reading master metadata or refreshing aggregates.
  SELECT r.id, r.product_id, r.author_name, r.origin, r.reviewer_type,
         r.criteria_version AS existing_criteria_version, r.created_at,
         r.comment AS existing_comment, r.verdict AS existing_verdict, r.variation AS existing_variation,
         p.cluster_id
  INTO v_review
  FROM rate.reviews r
  JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id
    AND r.origin IN ('crawl', 'community')
  FOR NO KEY UPDATE OF r FOR SHARE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đánh giá'
      USING ERRCODE = 'P0002', DETAIL = 'review_id';
  END IF;

  IF v_review.origin IS DISTINCT FROM 'community'
     OR NOT EXISTS (
       SELECT 1
       FROM rate.review_authors a
       WHERE a.review_id = p_review_id
         AND a.author_user_id = v_uid
     ) THEN
    RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa đánh giá này'
      USING ERRCODE = '42501';
  END IF;

  v_master_id := v_review.cluster_id;
  v_category := NULL;

  -- Lock the master row FOR UPDATE before reading its category so concurrent
  -- recategorization cannot skew v2 vs legacy validation (matching the FOR UPDATE
  -- later used by refresh_master_product_rating without lock upgrade).
  IF v_master_id IS NOT NULL THEN
    SELECT (SELECT c.slug FROM rate.categories c WHERE c.id = m.category_id)
    INTO v_category
    FROM rate.master_products m
    WHERE m.id = v_master_id
    FOR UPDATE;
  END IF;

  IF v_category IS NOT NULL THEN
    SELECT pg_catalog.max(criteria_version) INTO v_version
    FROM rate.rating_criteria
    WHERE category_slug = v_category;
  END IF;

  IF v_review.existing_criteria_version IS NOT NULL AND v_version IS NULL THEN
    RAISE EXCEPTION 'Danh mục này chưa có tiêu chí chấm điểm'
      USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;

  IF v_version IS NOT NULL THEN
    -- v2 path: mandatory criteria, verdict, pros, cons. p_rating_star cannot override criteria score.
    IF p_criteria_ratings IS NULL OR jsonb_typeof(p_criteria_ratings) <> 'object' THEN
      RAISE EXCEPTION 'Hãy chấm điểm các tiêu chí'
        USING ERRCODE = '22023', DETAIL = 'criteria';
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_criteria_ratings) LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM rate.rating_criteria
        WHERE criteria_version = v_version
          AND category_slug = v_category
          AND key = v_key
      ) THEN
        RAISE EXCEPTION 'Tiêu chí không thuộc danh mục này'
          USING ERRCODE = '22023', DETAIL = 'criteria.' || pg_catalog.left(v_key, 40);
      END IF;
    END LOOP;

    FOR v_criterion IN
      SELECT key, weight, required
      FROM rate.rating_criteria
      WHERE criteria_version = v_version
        AND category_slug = v_category
      ORDER BY position
    LOOP
      v_value := p_criteria_ratings -> v_criterion.key;
      IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
        IF v_criterion.required THEN
          RAISE EXCEPTION 'Tiêu chí này là bắt buộc'
            USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
        END IF;
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF jsonb_typeof(v_value) <> 'number' THEN
        RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5'
          USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
      END IF;

      v_star := (v_value #>> '{}')::numeric;
      IF v_star < 1 OR v_star > 5 OR v_star * 2 <> pg_catalog.trunc(v_star * 2) THEN
        RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5'
          USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
      END IF;

      v_star := pg_catalog.round(v_star, 1);
      v_clean_criteria := v_clean_criteria || jsonb_build_object(v_criterion.key, v_star);
      v_weighted := v_weighted + v_star * v_criterion.weight;
      v_weights := v_weights + v_criterion.weight;
    END LOOP;

    IF v_skipped > 2 THEN
      RAISE EXCEPTION 'Chỉ được bỏ qua tối đa 2 tiêu chí'
        USING ERRCODE = '22023', DETAIL = 'criteria';
    END IF;
    IF v_weights <= 0 THEN
      RAISE EXCEPTION 'Hãy chấm điểm các tiêu chí'
        USING ERRCODE = '22023', DETAIL = 'criteria';
    END IF;

    v_rating_exact := pg_catalog.round(v_weighted / v_weights, 1);
    v_rating_star := pg_catalog.round(v_rating_exact)::smallint;

    v_verdict := rate.review_text_stored(p_verdict);
    v_verdict_len := rate.review_text_length(v_verdict);
    IF v_verdict_len < 20 OR v_verdict_len > 300 THEN
      RAISE EXCEPTION 'Phần kết luận cần từ 20 đến 300 ký tự'
        USING ERRCODE = '22023', DETAIL = 'verdict';
    END IF;
    IF NOT rate.review_point_has_content(v_verdict) THEN
      RAISE EXCEPTION 'Phần kết luận chưa có nội dung'
        USING ERRCODE = '22023', DETAIL = 'verdict';
    END IF;

    v_pros := rate.review_point_list(p_pros, 'pro', 1, 5, 'pros');
    v_cons := rate.review_point_list(p_cons, 'con', 1, 5, 'cons');
    FOR v_i IN 1 .. pg_catalog.array_length(v_cons, 1) LOOP
      IF rate.review_point_compare(v_cons[v_i]) IN (
        SELECT rate.review_point_compare(x) FROM unnest(v_pros) x
      ) THEN
        RAISE EXCEPTION 'Một dòng không thể vừa là ưu điểm vừa là nhược điểm'
          USING ERRCODE = '22023', DETAIL = 'cons.' || (v_i - 1);
      END IF;
    END LOOP;

    IF p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) NOT IN ('object', 'null') THEN
      RAISE EXCEPTION 'Ưu nhược theo tiêu chí không hợp lệ'
        USING ERRCODE = '22023', DETAIL = 'criterion_points';
    END IF;

    IF p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) = 'object' THEN
      FOR v_key, v_points IN SELECT * FROM jsonb_each(p_criterion_points) LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM rate.rating_criteria
          WHERE criteria_version = v_version
            AND category_slug = v_category
            AND key = v_key
        ) THEN
          RAISE EXCEPTION 'Tiêu chí không thuộc danh mục này'
            USING ERRCODE = '22023', DETAIL = 'criterion_points.' || pg_catalog.left(v_key, 40);
        END IF;

        IF jsonb_typeof(v_points) <> 'object' THEN
          RAISE EXCEPTION 'Ưu nhược theo tiêu chí không hợp lệ'
            USING ERRCODE = '22023', DETAIL = 'criterion_points.' || v_key;
        END IF;

        v_cr_pros := rate.review_point_list(
          v_points -> 'pros', 'pro', 0, 3, 'criterion_points.' || v_key || '.pros'
        );
        v_cr_cons := rate.review_point_list(
          v_points -> 'cons', 'con', 0, 3, 'criterion_points.' || v_key || '.cons'
        );

        FOR v_i IN 1 .. COALESCE(pg_catalog.array_length(v_cr_cons, 1), 0) LOOP
          IF rate.review_point_compare(v_cr_cons[v_i]) IN (
            SELECT rate.review_point_compare(x) FROM unnest(v_cr_pros) x
          ) THEN
            RAISE EXCEPTION 'Một dòng không thể vừa là ưu điểm vừa là nhược điểm'
              USING ERRCODE = '22023', DETAIL = 'criterion_points.' || v_key || '.cons.' || (v_i - 1);
          END IF;
        END LOOP;

        v_criterion_lines := v_criterion_lines || jsonb_build_object(
          'key', v_key,
          'pros', to_jsonb(v_cr_pros),
          'cons', to_jsonb(v_cr_cons)
        );
      END LOOP;
    END IF;

    IF p_comment IS NULL THEN
      IF v_review.existing_comment IS NOT NULL
         AND v_review.existing_comment IS DISTINCT FROM COALESCE(v_review.existing_verdict, '') THEN
        v_comment := v_review.existing_comment;
      ELSE
        v_comment := v_verdict;
      END IF;
    ELSE
      v_comment := rate.review_text_stored(p_comment);
      v_comment_len := pg_catalog.char_length(v_comment);
      IF v_comment_len > 3000 THEN
        RAISE EXCEPTION 'Nội dung đánh giá tối đa 3000 ký tự'
          USING ERRCODE = '22023', DETAIL = 'comment';
      END IF;
      IF v_comment_len = 0 THEN
        v_comment := v_verdict;
      END IF;
    END IF;

    IF p_criterion_points IS NULL THEN
      SELECT pg_catalog.string_agg(rp.body, E'\n')
      INTO v_criterion_points_text
      FROM rate.review_points rp
      WHERE rp.review_id = p_review_id
        AND rp.method = 'writer'
        AND rp.criterion_key IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM rate.rating_criteria rc
          WHERE rc.criteria_version = v_version
            AND rc.category_slug = v_category
            AND rc.key = rp.criterion_key
        );
    ELSE
      SELECT pg_catalog.string_agg(line, E'\n')
      INTO v_criterion_points_text
      FROM jsonb_array_elements(v_criterion_lines) e,
           LATERAL (
             SELECT jsonb_array_elements_text(e -> 'pros')
             UNION ALL
             SELECT jsonb_array_elements_text(e -> 'cons')
           ) AS t(line);
    END IF;

    v_all_text := pg_catalog.concat_ws(
      E'\n',
      v_comment,
      v_verdict,
      pg_catalog.array_to_string(v_pros, E'\n'),
      pg_catalog.array_to_string(v_cons, E'\n'),
      v_criterion_points_text
    );

    IF v_all_text ~* '(nhận xu|kiếm xu|lấy xu|comment lấy xu|hình ảnh chỉ mang tính chất|video chỉ mang tính chất)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'low_value_coin_spam';
      v_reason := 'Phát hiện cụm từ bình luận cày xu mẫu, loại khỏi điểm trung bình.';
    ELSIF v_all_text ~* '(inbox zalo|liên hệ zalo|nhắn zalo|http://|https://|shopee\.ee|s\.shopee)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'seeding_fake';
      v_reason := 'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng, loại khỏi điểm trung bình.';
    ELSIF v_rating_star <= 2 AND v_all_text ~* '(shop lừa đảo sang shop|mua bên shop khác tốt hơn|đừng mua shop này qua shop)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'competitor_sabotage';
      v_reason := 'Nghi vấn điều hướng sang đối thủ, loại khỏi điểm trung bình.';
    END IF;
  ELSE
    -- Legacy v1 path: only permitted when category has no rating_criteria and review is non-v2.
    IF p_verdict IS NOT NULL
       OR (p_pros IS NOT NULL AND jsonb_typeof(p_pros) <> 'null')
       OR (p_cons IS NOT NULL AND jsonb_typeof(p_cons) <> 'null')
       OR (p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) <> 'null') THEN
      RAISE EXCEPTION 'Danh mục này chưa có tiêu chí chấm điểm'
        USING ERRCODE = '22023', DETAIL = 'criteria';
    END IF;

    IF p_rating_star IS NULL OR p_rating_star < 1 OR p_rating_star > 5 THEN
      RAISE EXCEPTION 'Số sao đánh giá phải từ 1 đến 5'
        USING ERRCODE = '22023', DETAIL = 'rating_star';
    END IF;
    v_rating_star := p_rating_star::smallint;
    v_rating_exact := NULL;
    v_verdict := NULL;

    IF p_comment IS NULL THEN
      v_comment := rate.review_text_stored(v_review.existing_comment);
    ELSE
      v_comment := rate.review_text_stored(p_comment);
    END IF;
    v_comment_len := pg_catalog.char_length(v_comment);
    IF v_comment_len < 15 OR v_comment_len > 3000 THEN
      RAISE EXCEPTION 'Nội dung đánh giá phải từ 15 đến 3000 ký tự'
        USING ERRCODE = '22023', DETAIL = 'comment';
    END IF;

    IF p_criteria_ratings IS NOT NULL AND jsonb_typeof(p_criteria_ratings) <> 'null' THEN
      IF jsonb_typeof(p_criteria_ratings) <> 'object' THEN
        RAISE EXCEPTION 'Tiêu chí đánh giá không hợp lệ'
          USING ERRCODE = '22023', DETAIL = 'criteria';
      END IF;
      IF (SELECT pg_catalog.count(*) FROM jsonb_object_keys(p_criteria_ratings)) > 32 THEN
        RAISE EXCEPTION 'Tiêu chí đánh giá không hợp lệ'
          USING ERRCODE = '22023', DETAIL = 'criteria';
      END IF;
      FOR v_key, v_value IN SELECT * FROM jsonb_each(p_criteria_ratings) LOOP
        IF v_key !~ '^[a-z_]{2,32}$' THEN
          RAISE EXCEPTION 'Tiêu chí không hợp lệ'
            USING ERRCODE = '22023', DETAIL = 'criteria.' || pg_catalog.left(v_key, 40);
        END IF;
        IF jsonb_typeof(v_value) <> 'number' THEN
          RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5'
            USING ERRCODE = '22023', DETAIL = 'criteria.' || v_key;
        END IF;
        v_star := (v_value #>> '{}')::numeric;
        IF v_star < 1 OR v_star > 5 OR v_star * 2 <> pg_catalog.trunc(v_star * 2) THEN
          RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5'
            USING ERRCODE = '22023', DETAIL = 'criteria.' || v_key;
        END IF;
      END LOOP;
      SELECT COALESCE(
        pg_catalog.jsonb_object_agg(
          e.key,
          to_jsonb(pg_catalog.round((e.value #>> '{}')::numeric, 1))
        ),
        '{}'::jsonb
      )
      INTO v_clean_criteria
      FROM jsonb_each(p_criteria_ratings) e;
    END IF;

    IF v_comment ~* '(nhận xu|kiếm xu|lấy xu|comment lấy xu|hình ảnh chỉ mang tính chất|video chỉ mang tính chất)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'low_value_coin_spam';
      v_reason := 'Phát hiện cụm từ bình luận cày xu mẫu, loại khỏi điểm trung bình.';
    ELSIF v_comment ~* '(inbox zalo|liên hệ zalo|nhắn zalo|http://|https://|shopee\.ee|s\.shopee)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'seeding_fake';
      v_reason := 'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng, loại khỏi điểm trung bình.';
    ELSIF v_rating_star <= 2 AND v_comment ~* '(shop lừa đảo sang shop|mua bên shop khác tốt hơn|đừng mua shop này qua shop)' THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'competitor_sabotage';
      v_reason := 'Nghi vấn điều hướng sang đối thủ, loại khỏi điểm trung bình.';
    ELSIF v_comment_len < 30 THEN
      v_flag_verdict := 'suspicious';
      v_flag_category := 'low_value_coin_spam';
      v_reason := 'Nội dung quá ngắn để kiểm chứng trải nghiệm, loại khỏi điểm trung bình.';
    END IF;
  END IF;

  IF p_variation IS NULL THEN
    v_clean_variation := v_review.existing_variation;
  ELSE
    v_clean_variation := NULLIF(pg_catalog.left(pg_catalog.btrim(p_variation), 120), '');
  END IF;

  IF p_criterion_points IS NULL AND v_version IS NOT NULL THEN
    DELETE FROM rate.review_points rp
    WHERE rp.review_id = p_review_id
      AND rp.method = 'writer'
      AND (
        rp.criterion_key IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM rate.rating_criteria rc
          WHERE rc.criteria_version = v_version
            AND rc.category_slug = v_category
            AND rc.key = rp.criterion_key
        )
      );
  ELSE
    DELETE FROM rate.review_points
    WHERE review_id = p_review_id
      AND method = 'writer';
  END IF;

  DELETE FROM rate.review_values
  WHERE review_id = p_review_id;

  UPDATE rate.reviews
  SET rating_star = v_rating_star,
      rating_exact = v_rating_exact,
      comment = v_comment,
      verdict = v_verdict,
      variation = v_clean_variation,
      criteria_ratings = v_clean_criteria,
      criteria_version = v_version,
      edited_at = pg_catalog.now(),
      helpfulness_weight = 0.00,
      value_score = NULL,
      value_breakdown = NULL,
      value_tier = NULL
  WHERE id = p_review_id
  RETURNING edited_at INTO v_edited_at;

  IF v_version IS NOT NULL THEN
    INSERT INTO rate.review_points (review_id, criterion_key, kind, body, position, method)
    SELECT p_review_id, NULL, 'pro', line, ord - 1, 'writer'
    FROM unnest(v_pros) WITH ORDINALITY AS t(line, ord)
    UNION ALL
    SELECT p_review_id, NULL, 'con', line, ord - 1, 'writer'
    FROM unnest(v_cons) WITH ORDINALITY AS t(line, ord)
    UNION ALL
    SELECT p_review_id, e ->> 'key', 'pro', line, ord - 1, 'writer'
    FROM jsonb_array_elements(v_criterion_lines) e,
         jsonb_array_elements_text(e -> 'pros') WITH ORDINALITY AS t(line, ord)
    UNION ALL
    SELECT p_review_id, e ->> 'key', 'con', line, ord - 1, 'writer'
    FROM jsonb_array_elements(v_criterion_lines) e,
         jsonb_array_elements_text(e -> 'cons') WITH ORDINALITY AS t(line, ord);

    SELECT pg_catalog.count(*)::integer
    INTO v_line_count
    FROM rate.review_points
    WHERE review_id = p_review_id
      AND method = 'writer';
  END IF;

  INSERT INTO rate.review_flags (
    review_id, verdict, fake_probability, flag_category, include_in_rating, reason, signals,
    detector, detector_version, generation, input_hash, analyzed_at
  )
  VALUES (
    p_review_id, v_flag_verdict, NULL, v_flag_category, false, v_reason, '{}'::jsonb,
    'rate-community-guard', 'v3', 1,
    rate.review_input_hash(v_review.author_name, v_rating_star, v_comment),
    pg_catalog.now()
  )
  ON CONFLICT (review_id) DO UPDATE
    SET verdict = EXCLUDED.verdict,
        fake_probability = NULL,
        flag_category = EXCLUDED.flag_category,
        include_in_rating = false,
        reason = EXCLUDED.reason,
        signals = '{}'::jsonb,
        detector = EXCLUDED.detector,
        detector_version = EXCLUDED.detector_version,
        generation = rate.review_flags.generation + 1,
        input_hash = EXCLUDED.input_hash,
        analyzed_at = EXCLUDED.analyzed_at;

  IF v_master_id IS NOT NULL THEN
    PERFORM rate.refresh_master_product_rating(v_master_id);
  END IF;

  RETURN jsonb_build_object(
    'id', p_review_id,
    'product_id', v_review.product_id,
    'master_product_id', v_master_id,
    'author_name', v_review.author_name,
    'rating_star', v_rating_star,
    'rating_exact', v_rating_exact,
    'criteria_ratings', v_clean_criteria,
    'criteria_version', v_version,
    'verdict', v_verdict,
    'comment', v_comment,
    'variation', v_clean_variation,
    'reviewer_type', v_review.reviewer_type,
    'points', v_line_count,
    'flag_verdict', v_flag_verdict,
    'flag_category', v_flag_category,
    'include_in_rating', false,
    'reason', v_reason,
    'created_at', v_review.created_at,
    'edited_at', v_edited_at
  );
END;
$$;

REVOKE ALL ON FUNCTION rate.edit_community_review(uuid, jsonb, text, jsonb, jsonb, text, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
GRANT EXECUTE ON FUNCTION rate.edit_community_review(uuid, jsonb, text, jsonb, jsonb, text, text, integer, jsonb)
  TO authenticated, service_role;

-- 5. rate.delete_community_review ---------------------------------------------

CREATE OR REPLACE FUNCTION rate.delete_community_review(p_review_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_claims jsonb := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_probe record;
  v_review record;
  v_master_id uuid;
  v_submitted_at timestamptz;
BEGIN
  IF v_uid IS NULL OR COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật để xóa đánh giá'
      USING ERRCODE = '42501';
  END IF;

  IF p_review_id IS NULL THEN
    RAISE EXCEPTION 'review_id is required'
      USING ERRCODE = '22023', DETAIL = 'review_id';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rate.submit_community_review:' || v_uid::text, 0)
  );

  SELECT r.id, r.origin, p.cluster_id
  INTO v_probe
  FROM rate.reviews r
  LEFT JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id
    AND r.origin IN ('crawl', 'community');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đánh giá'
      USING ERRCODE = 'P0002', DETAIL = 'review_id';
  END IF;

  IF v_probe.origin IS DISTINCT FROM 'community'
     OR NOT EXISTS (
       SELECT 1
       FROM rate.review_authors a
       WHERE a.review_id = p_review_id
         AND a.author_user_id = v_uid
     ) THEN
    RAISE EXCEPTION 'Bạn không có quyền xóa đánh giá này'
      USING ERRCODE = '42501';
  END IF;

  -- Lock any existing votes on this review in deterministic PK order before locking
  -- rate.reviews so direct vote DELETE/UPDATE triggers and delete_community_review
  -- follow the same lock hierarchy (review_votes -> reviews -> products -> master_products).
  PERFORM 1
  FROM rate.review_votes rv
  WHERE rv.review_id = p_review_id
  ORDER BY rv.voter_id
  FOR UPDATE;

  -- Lock both the review and its listing row before deleting so cluster moves cannot
  -- change v_master_id before refresh_master_product_rating runs.
  SELECT r.id, r.origin, p.cluster_id
  INTO v_review
  FROM rate.reviews r
  JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id
    AND r.origin IN ('crawl', 'community')
  FOR UPDATE OF r FOR SHARE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đánh giá'
      USING ERRCODE = 'P0002', DETAIL = 'review_id';
  END IF;

  SELECT a.created_at
  INTO v_submitted_at
  FROM rate.review_authors a
  WHERE a.review_id = p_review_id
    AND a.author_user_id = v_uid;

  IF v_review.origin IS DISTINCT FROM 'community' OR NOT FOUND THEN
    RAISE EXCEPTION 'Bạn không có quyền xóa đánh giá này'
      USING ERRCODE = '42501';
  END IF;

  v_master_id := v_review.cluster_id;

  -- Clean up expired (>24h) quota tombstones in bounded batches so the ledger stays compact.
  PERFORM rate.purge_deleted_review_submissions(interval '24 hours', 50);

  -- Preserve recent 24h submission quota slot across delete + resubmit.
  IF v_submitted_at IS NOT NULL AND v_submitted_at > pg_catalog.now() - interval '24 hours' THEN
    INSERT INTO rate.review_deleted_submissions (review_id, author_user_id, submitted_at)
    VALUES (p_review_id, v_uid, v_submitted_at)
    ON CONFLICT (review_id) DO NOTHING;
  END IF;

  DELETE FROM rate.reviews
  WHERE id = p_review_id;

  IF v_master_id IS NOT NULL THEN
    PERFORM rate.refresh_master_product_rating(v_master_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_review_id,
    'master_product_id', v_master_id
  );
END;
$$;

REVOKE ALL ON FUNCTION rate.delete_community_review(uuid)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
GRANT EXECUTE ON FUNCTION rate.delete_community_review(uuid)
  TO authenticated;

-- 5b. Serialize refresh_master_product_rating and refresh_review_vote_counts --

CREATE OR REPLACE FUNCTION rate.refresh_master_product_rating(p_master_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prev_weighted numeric;
  v_prev_count integer;
  v_next_weighted numeric;
  v_next_count integer;
BEGIN
  IF p_master_id IS NULL THEN
    RETURN;
  END IF;

  -- Lock the master row before scanning review aggregates so concurrent edits,
  -- deletions, and review_votes trigger updates commit in strict sequence.
  SELECT m.user_rating_weighted, m.authentic_review_count
  INTO v_prev_weighted, v_prev_count
  FROM rate.master_products m
  WHERE m.id = p_master_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE rate.master_products m
  SET user_rating_weighted = COALESCE(s.weighted, 0),
      authentic_review_count = COALESCE(s.n, 0),
      updated_at = pg_catalog.now()
  FROM (
    SELECT
      pg_catalog.round(
        (pg_catalog.sum(r.rating_star * r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'))
        / NULLIF(pg_catalog.sum(r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'), 0),
        2
      ) AS weighted,
      (pg_catalog.count(*) FILTER (WHERE r.reviewer_type = 'user'))::INTEGER AS n
    FROM rate.products p
    JOIN rate.reviews r ON r.product_id = p.id
    JOIN rate.review_flags f ON f.review_id = r.id
    WHERE p.cluster_id = p_master_id
      AND p.origin = 'crawl'
      AND r.origin IN ('crawl', 'community')
      -- Reviews excluded from the rating (unanalyzed community reviews,
      -- flagged ones) never count, whatever their weight (20261014033000).
      AND COALESCE(f.include_in_rating, true)
      AND r.helpfulness_weight > 0
  ) s
  WHERE m.id = p_master_id
  RETURNING m.user_rating_weighted, m.authentic_review_count
  INTO v_next_weighted, v_next_count;

  -- trg_master_products_rating_extras runs refresh_master_rating_extras when
  -- (user_rating_weighted, authentic_review_count) changes. Run it explicitly only when
  -- those columns stayed identical so a prior statement trigger hitting SKIP LOCKED
  -- never leaves rating_weight_sum / criteria_scores stale without double-computing.
  IF (v_prev_weighted, v_prev_count) IS NOT DISTINCT FROM (v_next_weighted, v_next_count)
     AND pg_catalog.to_regprocedure('rate.refresh_master_rating_extras(uuid)') IS NOT NULL THEN
    PERFORM rate.refresh_master_rating_extras(p_master_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION rate.refresh_master_product_rating(UUID)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_master_product_rating(UUID)
  TO service_role, rate_worker;

CREATE OR REPLACE FUNCTION rate.refresh_review_vote_counts(p_review_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_up INTEGER;
  v_down INTEGER;
  v_rep INTEGER;
  v_cat TEXT;
  v_verdict TEXT;
  v_inc BOOLEAN;
  v_master UUID;
BEGIN
  IF p_review_id IS NULL THEN
    RETURN;
  END IF;

  -- Lock the review row (FOR NO KEY UPDATE so concurrent vote FK checks holding
  -- FOR KEY SHARE do not deadlock) before reading review_flags so concurrent
  -- edit_community_review resets cannot be overwritten by a pre-edit snapshot.
  PERFORM 1
  FROM rate.reviews r
  WHERE r.id = p_review_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    pg_catalog.count(*) FILTER (WHERE vote = 'up'),
    pg_catalog.count(*) FILTER (WHERE vote = 'down'),
    pg_catalog.count(*) FILTER (WHERE reported)
  INTO v_up, v_down, v_rep
  FROM rate.review_votes
  WHERE review_id = p_review_id;

  SELECT f.flag_category, f.verdict, COALESCE(f.include_in_rating, true)
  INTO v_cat, v_verdict, v_inc
  FROM rate.review_flags f
  WHERE f.review_id = p_review_id;

  UPDATE rate.reviews
  SET upvotes = v_up,
      downvotes = v_down,
      report_count = v_rep,
      helpfulness_weight = CASE
        WHEN NOT COALESCE(v_inc, true) THEN 0.00
        ELSE rate.compute_review_weight(
          v_up, v_down, v_rep,
          COALESCE(v_cat, 'authentic'),
          COALESCE(v_verdict, 'unanalyzed')
        )
      END
  WHERE id = p_review_id;

  SELECT p.cluster_id INTO v_master
  FROM rate.reviews r
  JOIN rate.products p ON p.id = r.product_id
  WHERE r.id = p_review_id;

  IF v_master IS NOT NULL THEN
    PERFORM rate.refresh_master_product_rating(v_master);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION rate.refresh_review_vote_counts(UUID)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
GRANT EXECUTE ON FUNCTION rate.refresh_review_vote_counts(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION rate.reserve_review_generation(
  p_review_id uuid,
  p_input_hash text
) RETURNS TABLE(generation bigint, input_hash text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_hash text;
  v_gen bigint;
BEGIN
  -- Lock the review row first (same reviews -> review_flags order as commit_review_verdict
  -- and edit_community_review) so concurrent edits and flag generation reservations serialize
  -- without deadlocking via trg_review_flags_sync_weight.
  SELECT rate.review_input_hash(r.author_name, r.rating_star, r.comment)
  INTO v_current_hash
  FROM rate.reviews r
  WHERE r.id = p_review_id
  FOR NO KEY UPDATE;

  IF v_current_hash IS NULL THEN
    RAISE EXCEPTION 'review % not found', p_review_id;
  END IF;
  IF v_current_hash <> p_input_hash THEN
    RAISE EXCEPTION 'stale analysis input: review % current hash is %, caller has %',
      p_review_id, v_current_hash, p_input_hash;
  END IF;

  INSERT INTO rate.review_flags (review_id, input_hash, generation, detector, detector_version, verdict)
    VALUES (p_review_id, v_current_hash, 1, 'pending', '0', 'unanalyzed')
    ON CONFLICT (review_id) DO UPDATE
      SET generation = rate.review_flags.generation + 1,
          input_hash = EXCLUDED.input_hash,
          verdict = 'unanalyzed',
          analyzed_at = pg_catalog.now()
    RETURNING rate.review_flags.generation, rate.review_flags.input_hash INTO v_gen, v_current_hash;
  RETURN QUERY SELECT v_gen, v_current_hash;
END;
$$;

REVOKE ALL ON FUNCTION rate.reserve_review_generation(uuid, text)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
GRANT EXECUTE ON FUNCTION rate.reserve_review_generation(uuid, text)
  TO service_role;

-- 6. Quota-preserving submit_community_review & submit_community_review_v2 -----

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
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_claims JSONB := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
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

  IF v_uid IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để gửi đánh giá' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_service AND COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật để gửi đánh giá' USING ERRCODE = '42501';
  END IF;

  IF p_master_product_id IS NULL THEN
    RAISE EXCEPTION 'master_product_id is required' USING ERRCODE = '22023';
  END IF;

  v_clean_author := pg_catalog.left(pg_catalog.btrim(COALESCE(p_author_name, '')), 80);
  IF pg_catalog.char_length(v_clean_author) < 2 THEN
    v_clean_author := 'Người dùng Rate.vn';
  END IF;

  v_clean_comment := pg_catalog.btrim(COALESCE(p_comment, ''));
  v_comment_len := pg_catalog.char_length(v_clean_comment);
  IF v_comment_len < 15 OR v_comment_len > 3000 THEN
    RAISE EXCEPTION 'Nội dung đánh giá phải từ 15 đến 3000 ký tự' USING ERRCODE = '22023';
  END IF;

  IF p_rating_star IS NULL OR p_rating_star < 1 OR p_rating_star > 5 THEN
    RAISE EXCEPTION 'Số sao đánh giá phải từ 1 đến 5' USING ERRCODE = '22023';
  END IF;

  v_clean_type := CASE
    WHEN p_reviewer_type = 'expert' AND v_is_service THEN 'expert'
    ELSE 'user'
  END;

  v_clean_criteria := CASE
    WHEN p_criteria_ratings IS NOT NULL AND jsonb_typeof(p_criteria_ratings) = 'object'
    THEN p_criteria_ratings
    ELSE '{}'::jsonb
  END;

  v_clean_variation := NULLIF(pg_catalog.left(pg_catalog.btrim(COALESCE(p_variation, '')), 120), '');

  SELECT id INTO v_product_id
  FROM rate.products
  WHERE cluster_id = p_master_product_id
    AND origin = 'crawl'
  ORDER BY price_current ASC NULLS LAST, created_at ASC
  LIMIT 1;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy listing liên kết cho sản phẩm chuẩn hóa này' USING ERRCODE = 'P0002';
  END IF;

  IF v_uid IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('rate.submit_community_review:' || v_uid::text, 0)
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

    SELECT
      (SELECT pg_catalog.count(*)
       FROM rate.review_authors
       WHERE author_user_id = v_uid
         AND created_at > pg_catalog.now() - interval '24 hours')
      +
      (SELECT pg_catalog.count(*)
       FROM rate.review_deleted_submissions
       WHERE author_user_id = v_uid
         AND submitted_at > pg_catalog.now() - interval '24 hours')
    INTO v_recent;

    IF v_recent >= 5 THEN
      RAISE EXCEPTION 'Bạn đã gửi quá 5 đánh giá trong 24 giờ, vui lòng thử lại sau' USING ERRCODE = '54000';
    END IF;
  END IF;

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
    'rate_comm_' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
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

REVOKE ALL ON FUNCTION rate.submit_community_review(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
GRANT EXECUTE ON FUNCTION rate.submit_community_review(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION rate.submit_community_review_v2(
  p_master_product_id uuid,
  p_criteria_ratings jsonb,
  p_verdict text,
  p_pros jsonb,
  p_cons jsonb,
  p_criterion_points jsonb DEFAULT '{}'::jsonb,
  p_comment text DEFAULT NULL,
  p_author_name text DEFAULT NULL,
  p_variation text DEFAULT NULL,
  p_reviewer_type text DEFAULT 'user'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_claims jsonb := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_is_service boolean;
  v_category text;
  v_version integer;
  v_criterion record;
  v_value jsonb;
  v_star numeric;
  v_clean_criteria jsonb := '{}'::jsonb;
  v_weighted numeric := 0;
  v_weights integer := 0;
  v_skipped integer := 0;
  v_rating_exact numeric(2, 1);
  v_rating_star smallint;
  v_verdict text;
  v_verdict_len integer;
  v_pros text[];
  v_cons text[];
  v_key text;
  v_points jsonb;
  v_cr_pros text[];
  v_cr_cons text[];
  v_criterion_lines jsonb := '[]'::jsonb;
  v_comment text;
  v_comment_len integer;
  v_all_text text;
  v_clean_author text;
  v_clean_variation text;
  v_clean_type text;
  v_product_id uuid;
  v_recent integer;
  v_review_id uuid;
  v_created_at timestamptz;
  v_line_count integer := 0;
  v_i integer;
  v_flag_verdict text := 'unanalyzed';
  v_flag_category text := NULL;
  v_reason text := 'Đánh giá cộng đồng đang chờ phân tích, chưa được tính vào điểm trung bình.';
BEGIN
  v_is_service := COALESCE(v_claims ->> 'role', '') = 'service_role';

  IF v_uid IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để gửi đánh giá' USING ERRCODE = '42501';
  END IF;
  IF NOT v_is_service AND COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật để gửi đánh giá' USING ERRCODE = '42501';
  END IF;
  IF p_master_product_id IS NULL THEN
    RAISE EXCEPTION 'master_product_id is required' USING ERRCODE = '22023', DETAIL = 'master_product_id';
  END IF;

  SELECT c.slug INTO v_category
  FROM rate.master_products m
  LEFT JOIN rate.categories c ON c.id = m.category_id
  WHERE m.id = p_master_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy sản phẩm' USING ERRCODE = 'P0002', DETAIL = 'master_product_id';
  END IF;
  SELECT pg_catalog.max(criteria_version) INTO v_version
  FROM rate.rating_criteria WHERE category_slug = v_category;
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'Danh mục này chưa có tiêu chí chấm điểm' USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;

  IF p_criteria_ratings IS NULL OR jsonb_typeof(p_criteria_ratings) <> 'object' THEN
    RAISE EXCEPTION 'Hãy chấm điểm các tiêu chí' USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_criteria_ratings) LOOP
    IF NOT EXISTS (SELECT 1 FROM rate.rating_criteria
                   WHERE criteria_version = v_version AND category_slug = v_category AND key = v_key) THEN
      RAISE EXCEPTION 'Tiêu chí không thuộc danh mục này' USING ERRCODE = '22023', DETAIL = 'criteria.' || pg_catalog.left(v_key, 40);
    END IF;
  END LOOP;
  FOR v_criterion IN
    SELECT key, weight, required FROM rate.rating_criteria
    WHERE criteria_version = v_version AND category_slug = v_category
    ORDER BY position
  LOOP
    v_value := p_criteria_ratings -> v_criterion.key;
    IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
      IF v_criterion.required THEN
        RAISE EXCEPTION 'Tiêu chí này là bắt buộc' USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
      END IF;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_value) <> 'number' THEN
      RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5' USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
    END IF;
    v_star := (v_value #>> '{}')::numeric;
    IF v_star < 1 OR v_star > 5 OR v_star * 2 <> pg_catalog.trunc(v_star * 2) THEN
      RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5' USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
    END IF;
    v_star := pg_catalog.round(v_star, 1);
    v_clean_criteria := v_clean_criteria || jsonb_build_object(v_criterion.key, v_star);
    v_weighted := v_weighted + v_star * v_criterion.weight;
    v_weights := v_weights + v_criterion.weight;
  END LOOP;
  IF v_skipped > 2 THEN
    RAISE EXCEPTION 'Chỉ được bỏ qua tối đa 2 tiêu chí' USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;
  v_rating_exact := pg_catalog.round(v_weighted / v_weights, 1);
  v_rating_star := pg_catalog.round(v_rating_exact)::smallint;

  v_verdict := rate.review_text_stored(p_verdict);
  v_verdict_len := rate.review_text_length(v_verdict);
  IF v_verdict_len < 20 OR v_verdict_len > 300 THEN
    RAISE EXCEPTION 'Phần kết luận cần từ 20 đến 300 ký tự' USING ERRCODE = '22023', DETAIL = 'verdict';
  END IF;
  IF NOT rate.review_point_has_content(v_verdict) THEN
    RAISE EXCEPTION 'Phần kết luận chưa có nội dung' USING ERRCODE = '22023', DETAIL = 'verdict';
  END IF;

  v_pros := rate.review_point_list(p_pros, 'pro', 1, 5, 'pros');
  v_cons := rate.review_point_list(p_cons, 'con', 1, 5, 'cons');
  FOR v_i IN 1 .. pg_catalog.array_length(v_cons, 1) LOOP
    IF rate.review_point_compare(v_cons[v_i]) IN (SELECT rate.review_point_compare(x) FROM unnest(v_pros) x) THEN
      RAISE EXCEPTION 'Một dòng không thể vừa là ưu điểm vừa là nhược điểm'
        USING ERRCODE = '22023', DETAIL = 'cons.' || (v_i - 1);
    END IF;
  END LOOP;

  IF p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'Ưu nhược theo tiêu chí không hợp lệ' USING ERRCODE = '22023', DETAIL = 'criterion_points';
  END IF;
  IF p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) = 'object' THEN
    FOR v_key, v_points IN SELECT * FROM jsonb_each(p_criterion_points) LOOP
      IF NOT EXISTS (SELECT 1 FROM rate.rating_criteria
                     WHERE criteria_version = v_version AND category_slug = v_category AND key = v_key) THEN
        RAISE EXCEPTION 'Tiêu chí không thuộc danh mục này'
          USING ERRCODE = '22023', DETAIL = 'criterion_points.' || pg_catalog.left(v_key, 40);
      END IF;
      IF jsonb_typeof(v_points) <> 'object' THEN
        RAISE EXCEPTION 'Ưu nhược theo tiêu chí không hợp lệ'
          USING ERRCODE = '22023', DETAIL = 'criterion_points.' || v_key;
      END IF;
      v_cr_pros := rate.review_point_list(v_points -> 'pros', 'pro', 0, 3, 'criterion_points.' || v_key || '.pros');
      v_cr_cons := rate.review_point_list(v_points -> 'cons', 'con', 0, 3, 'criterion_points.' || v_key || '.cons');
      FOR v_i IN 1 .. COALESCE(pg_catalog.array_length(v_cr_cons, 1), 0) LOOP
        IF rate.review_point_compare(v_cr_cons[v_i]) IN (SELECT rate.review_point_compare(x) FROM unnest(v_cr_pros) x) THEN
          RAISE EXCEPTION 'Một dòng không thể vừa là ưu điểm vừa là nhược điểm'
            USING ERRCODE = '22023', DETAIL = 'criterion_points.' || v_key || '.cons.' || (v_i - 1);
        END IF;
      END LOOP;
      v_criterion_lines := v_criterion_lines || jsonb_build_object('key', v_key, 'pros', to_jsonb(v_cr_pros), 'cons', to_jsonb(v_cr_cons));
    END LOOP;
  END IF;

  v_comment := rate.review_text_stored(p_comment);
  v_comment_len := pg_catalog.char_length(v_comment);
  IF v_comment_len > 3000 THEN
    RAISE EXCEPTION 'Nội dung đánh giá tối đa 3000 ký tự' USING ERRCODE = '22023', DETAIL = 'comment';
  END IF;
  IF v_comment_len = 0 THEN
    v_comment := v_verdict;
  END IF;

  v_clean_author := pg_catalog.left(pg_catalog.btrim(COALESCE(p_author_name, '')), 80);
  IF pg_catalog.char_length(v_clean_author) < 2 THEN
    v_clean_author := 'Người dùng Rate.vn';
  END IF;
  v_clean_variation := NULLIF(pg_catalog.left(pg_catalog.btrim(COALESCE(p_variation, '')), 120), '');
  v_clean_type := CASE WHEN p_reviewer_type = 'expert' AND v_is_service THEN 'expert' ELSE 'user' END;

  SELECT id INTO v_product_id
  FROM rate.products
  WHERE cluster_id = p_master_product_id AND origin = 'crawl'
  ORDER BY price_current ASC NULLS LAST, created_at ASC
  LIMIT 1;
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy listing liên kết cho sản phẩm chuẩn hóa này' USING ERRCODE = 'P0002';
  END IF;

  IF v_uid IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('rate.submit_community_review:' || v_uid::text, 0)
    );
    IF EXISTS (
      SELECT 1 FROM rate.review_authors a
      JOIN rate.reviews r ON r.id = a.review_id
      JOIN rate.products p ON p.id = r.product_id
      WHERE a.author_user_id = v_uid AND p.cluster_id = p_master_product_id
    ) THEN
      RAISE EXCEPTION 'Bạn đã gửi đánh giá cho sản phẩm này' USING ERRCODE = '23505';
    END IF;
    SELECT
      (SELECT pg_catalog.count(*)
       FROM rate.review_authors
       WHERE author_user_id = v_uid
         AND created_at > pg_catalog.now() - interval '24 hours')
      +
      (SELECT pg_catalog.count(*)
       FROM rate.review_deleted_submissions
       WHERE author_user_id = v_uid
         AND submitted_at > pg_catalog.now() - interval '24 hours')
    INTO v_recent;
    IF v_recent >= 5 THEN
      RAISE EXCEPTION 'Bạn đã gửi quá 5 đánh giá trong 24 giờ, vui lòng thử lại sau' USING ERRCODE = '54000';
    END IF;
  END IF;

  v_all_text := pg_catalog.concat_ws(E'\n', v_comment, v_verdict,
    pg_catalog.array_to_string(v_pros, E'\n'), pg_catalog.array_to_string(v_cons, E'\n'),
    (SELECT pg_catalog.string_agg(line, E'\n') FROM jsonb_array_elements(v_criterion_lines) e,
       LATERAL (SELECT jsonb_array_elements_text(e -> 'pros') UNION ALL SELECT jsonb_array_elements_text(e -> 'cons')) AS t(line)));
  IF v_all_text ~* '(nhận xu|kiếm xu|lấy xu|comment lấy xu|hình ảnh chỉ mang tính chất|video chỉ mang tính chất)' THEN
    v_flag_verdict := 'suspicious';
    v_flag_category := 'low_value_coin_spam';
    v_reason := 'Phát hiện cụm từ bình luận cày xu mẫu, loại khỏi điểm trung bình.';
  ELSIF v_all_text ~* '(inbox zalo|liên hệ zalo|nhắn zalo|http://|https://|shopee\.ee|s\.shopee)' THEN
    v_flag_verdict := 'suspicious';
    v_flag_category := 'seeding_fake';
    v_reason := 'Phát hiện đường dẫn quảng cáo hoặc điều hướng ngoài luồng, loại khỏi điểm trung bình.';
  ELSIF v_rating_star <= 2 AND v_all_text ~* '(shop lừa đảo sang shop|mua bên shop khác tốt hơn|đừng mua shop này qua shop)' THEN
    v_flag_verdict := 'suspicious';
    v_flag_category := 'competitor_sabotage';
    v_reason := 'Nghi vấn điều hướng sang đối thủ, loại khỏi điểm trung bình.';
  END IF;

  INSERT INTO rate.reviews (
    product_id, platform_review_id, author_name, rating_star, rating_exact, comment, verdict,
    variation, is_verified_buyer, reviewer_type, criteria_ratings, criteria_version,
    upvotes, downvotes, report_count, helpfulness_weight
  )
  VALUES (
    v_product_id, 'rate_comm_' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), v_clean_author,
    v_rating_star, v_rating_exact, v_comment, v_verdict, v_clean_variation, NULL, v_clean_type,
    v_clean_criteria, v_version, 0, 0, 0, 0.00
  )
  RETURNING id, created_at INTO v_review_id, v_created_at;

  INSERT INTO rate.review_points (review_id, criterion_key, kind, body, position, method)
  SELECT v_review_id, NULL, 'pro', line, ord - 1, 'writer' FROM unnest(v_pros) WITH ORDINALITY AS t(line, ord)
  UNION ALL
  SELECT v_review_id, NULL, 'con', line, ord - 1, 'writer' FROM unnest(v_cons) WITH ORDINALITY AS t(line, ord)
  UNION ALL
  SELECT v_review_id, e ->> 'key', 'pro', line, ord - 1, 'writer'
  FROM jsonb_array_elements(v_criterion_lines) e,
       jsonb_array_elements_text(e -> 'pros') WITH ORDINALITY AS t(line, ord)
  UNION ALL
  SELECT v_review_id, e ->> 'key', 'con', line, ord - 1, 'writer'
  FROM jsonb_array_elements(v_criterion_lines) e,
       jsonb_array_elements_text(e -> 'cons') WITH ORDINALITY AS t(line, ord);
  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  IF v_uid IS NOT NULL THEN
    INSERT INTO rate.review_authors (review_id, author_user_id) VALUES (v_review_id, v_uid);
  END IF;

  INSERT INTO rate.review_flags (
    review_id, verdict, fake_probability, flag_category, include_in_rating, reason, signals,
    detector, detector_version, input_hash
  )
  VALUES (
    v_review_id, v_flag_verdict, NULL, v_flag_category, false, v_reason, '{}'::jsonb,
    'rate-community-guard', 'v3',
    rate.review_input_hash(v_clean_author, v_rating_star, v_comment)
  );

  RETURN jsonb_build_object(
    'id', v_review_id,
    'product_id', v_product_id,
    'author_name', v_clean_author,
    'rating_star', v_rating_star,
    'rating_exact', v_rating_exact,
    'criteria_ratings', v_clean_criteria,
    'criteria_version', v_version,
    'verdict', v_verdict,
    'comment', v_comment,
    'variation', v_clean_variation,
    'reviewer_type', v_clean_type,
    'points', v_line_count,
    'flag_verdict', v_flag_verdict,
    'flag_category', v_flag_category,
    'include_in_rating', false,
    'reason', v_reason,
    'created_at', v_created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION rate.submit_community_review_v2(uuid, jsonb, text, jsonb, jsonb, jsonb, text, text, text, text)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
GRANT EXECUTE ON FUNCTION rate.submit_community_review_v2(uuid, jsonb, text, jsonb, jsonb, jsonb, text, text, text, text)
  TO authenticated, service_role;

-- 7. Stale-edit-guarded rate.store_review_values ------------------------------

CREATE OR REPLACE FUNCTION rate.store_review_values(p_values jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_index integer := 0;
  v_b jsonb;
  v_score numeric;
  v_sum numeric;
  v_c numeric;
  v_gaps text[];
  v_tier text;
  v_changed integer;
  v_upserted_ids uuid[] := '{}'::uuid[];
  v_affected_masters uuid[] := '{}'::uuid[];
BEGIN
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_values must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_values) > 1000 OR pg_catalog.octet_length(p_values::text) > 2097152 THEN
    RAISE EXCEPTION 'at most 1000 rows and 2 MB per call' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_values) LOOP
    v_b := v_row -> 'breakdown';
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_row -> 'id') IS DISTINCT FROM 'string'
       OR (v_row ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(v_row -> 'score') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b) IS DISTINCT FROM 'object'
       OR v_row - ARRAY['id', 'score', 'breakdown', 'edited_at'] <> '{}'::jsonb
       OR (v_row ? 'edited_at' AND jsonb_typeof(v_row -> 'edited_at') NOT IN ('string', 'null'))
       OR v_b - ARRAY['version', 'gated', 'score', 'completeness', 'weightCompleteness',
                      'specificity', 'verified', 'helpful', 'trust', 'tier', 'gaps'] <> '{}'::jsonb
       OR NOT v_b ?& ARRAY['version', 'gated', 'score', 'completeness', 'weightCompleteness',
                          'specificity', 'verified', 'helpful', 'trust', 'tier', 'gaps']
       OR v_b -> 'version' IS DISTINCT FROM '1'::jsonb
       OR jsonb_typeof(v_b -> 'gated') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(v_b -> 'score') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'completeness') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'weightCompleteness') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'specificity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'verified') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'helpful') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'trust') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_b -> 'tier') NOT IN ('string', 'null')
       OR jsonb_typeof(v_b -> 'gaps') IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_b -> 'gaps') g
                  WHERE jsonb_typeof(g) IS DISTINCT FROM 'string') THEN
      RAISE EXCEPTION 'row % is not a review value', v_index USING ERRCODE = '22023';
    END IF;
    IF v_row ? 'edited_at' THEN
      IF jsonb_typeof(v_row -> 'edited_at') NOT IN ('string', 'null') THEN
        RAISE EXCEPTION 'row % is not a review value', v_index USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_row -> 'edited_at') = 'string' THEN
        BEGIN
          PERFORM (v_row ->> 'edited_at')::timestamptz;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'row % is not a review value', v_index USING ERRCODE = '22023';
        END;
      END IF;
    END IF;
    v_score := (v_row ->> 'score')::numeric;
    v_c := (v_b ->> 'completeness')::numeric;
    v_sum := v_c + (v_b ->> 'specificity')::numeric
           + (v_b ->> 'verified')::numeric + (v_b ->> 'helpful')::numeric
           + (v_b ->> 'trust')::numeric;
    v_gaps := ARRAY(SELECT jsonb_array_elements_text(v_b -> 'gaps'));
    v_tier := v_b ->> 'tier';
    IF v_c NOT IN (0, 5, 10, 15, 20, 25, 30, 35)
       OR v_c - (v_b ->> 'weightCompleteness')::numeric NOT IN (0, 5)
       OR (v_c - (v_b ->> 'weightCompleteness')::numeric = 5)
          IS DISTINCT FROM ('pros_cons' = ANY (v_gaps) AND NOT 'photo' = ANY (v_gaps) AND v_c > 0)
       OR (v_b ->> 'specificity')::numeric NOT IN (0, 5, 12, 17, 20)
       OR (v_b ->> 'verified')::numeric NOT IN (0, 15)
       OR (v_b ->> 'helpful')::numeric NOT BETWEEN 0 AND 20
       OR (v_b ->> 'trust')::numeric NOT BETWEEN 0 AND 10
       OR v_score NOT BETWEEN 0 AND 100
       OR (v_b ->> 'score')::numeric <> v_score
       OR pg_catalog.abs(v_sum - v_score) > 0.01
       OR pg_catalog.cardinality(v_gaps) <> (SELECT pg_catalog.count(DISTINCT g) FROM unnest(v_gaps) g)
       OR NOT v_gaps <@ ARRAY['detail', 'criteria', 'verdict', 'pros_cons', 'criterion_points',
                               'photo', 'verified']
       OR (CASE WHEN (v_b ->> 'gated')::boolean
               THEN v_sum <> 0 OR v_score <> 0 OR v_tier IS NOT NULL OR pg_catalog.cardinality(v_gaps) <> 0
               ELSE v_tier IS DISTINCT FROM CASE WHEN v_c < 30 THEN 'basic'
                                                 WHEN v_score >= 70 THEN 'excellent'
                                                 ELSE 'complete' END
           END) THEN
      RAISE EXCEPTION 'row % has values out of range', v_index USING ERRCODE = '22023';
    END IF;
    v_index := v_index + 1;
  END LOOP;

  PERFORM 1 FROM rate.reviews r
  WHERE r.id IN (SELECT (e ->> 'id')::uuid FROM jsonb_array_elements(p_values) e)
  ORDER BY r.id
  FOR NO KEY UPDATE;

  WITH upserted AS (
    INSERT INTO rate.review_values AS rv (review_id, value_score, value_breakdown, updated_at)
    SELECT b.review_id, b.value_score, b.value_breakdown, pg_catalog.now()
    FROM (SELECT DISTINCT ON ((e ->> 'id')::uuid)
                 (e ->> 'id')::uuid AS review_id,
                 pg_catalog.round((e ->> 'score')::numeric, 2) AS value_score,
                 e -> 'breakdown' AS value_breakdown,
                 CASE WHEN e ? 'edited_at' AND jsonb_typeof(e -> 'edited_at') = 'string'
                      THEN (e ->> 'edited_at')::timestamptz
                      ELSE NULL::timestamptz END AS expected_edited_at
          FROM jsonb_array_elements(p_values) WITH ORDINALITY AS a(e, n)
          ORDER BY (e ->> 'id')::uuid, n DESC) b
    JOIN rate.reviews r ON r.id = b.review_id
    WHERE r.edited_at IS NOT DISTINCT FROM b.expected_edited_at
    ORDER BY b.review_id
    ON CONFLICT (review_id) DO UPDATE
      SET value_score = EXCLUDED.value_score,
          value_breakdown = EXCLUDED.value_breakdown,
          updated_at = EXCLUDED.updated_at
      WHERE (rv.value_score, rv.value_breakdown)
            IS DISTINCT FROM (EXCLUDED.value_score, EXCLUDED.value_breakdown)
    RETURNING review_id
  )
  SELECT COALESCE(pg_catalog.array_agg(u.review_id), '{}'::uuid[])
  INTO v_upserted_ids
  FROM upserted u;

  v_changed := COALESCE(pg_catalog.cardinality(v_upserted_ids), 0);

  UPDATE rate.reviews r
  SET value_tier = b.value_breakdown ->> 'tier'
  FROM (SELECT DISTINCT ON ((e ->> 'id')::uuid)
               (e ->> 'id')::uuid AS review_id,
               e -> 'breakdown' AS value_breakdown,
               CASE WHEN e ? 'edited_at' AND jsonb_typeof(e -> 'edited_at') = 'string'
                    THEN (e ->> 'edited_at')::timestamptz
                    ELSE NULL::timestamptz END AS expected_edited_at
        FROM jsonb_array_elements(p_values) WITH ORDINALITY AS a(e, n)
        ORDER BY (e ->> 'id')::uuid, n DESC) b
  WHERE r.id = b.review_id
    AND r.edited_at IS NOT DISTINCT FROM b.expected_edited_at
    AND r.value_tier IS DISTINCT FROM (b.value_breakdown ->> 'tier');

  IF v_changed > 0
     AND pg_catalog.to_regprocedure('rate.refresh_rating_extras_of_products(uuid[])') IS NOT NULL THEN
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT p.cluster_id), '{}'::uuid[])
    INTO v_affected_masters
    FROM rate.reviews r
    JOIN rate.products p ON p.id = r.product_id
    WHERE r.id = ANY (v_upserted_ids)
      AND p.cluster_id IS NOT NULL;

    IF pg_catalog.cardinality(v_affected_masters) > 0 THEN
      -- Lock affected masters in deterministic id order after review_values writes so
      -- any statement trigger skipped via FOR UPDATE SKIP LOCKED during a concurrent edit
      -- or delete converges under lock before store_review_values commits.
      PERFORM 1
      FROM rate.master_products m
      WHERE m.id = ANY (v_affected_masters)
      ORDER BY m.id
      FOR UPDATE;

      PERFORM rate.refresh_rating_extras_of_products(
        ARRAY(
          SELECT DISTINCT r.product_id
          FROM rate.reviews r
          WHERE r.id = ANY (v_upserted_ids)
        )
      );
    END IF;
  END IF;

  RETURN v_changed;
END $$;

REVOKE ALL ON FUNCTION rate.store_review_values(jsonb)
  FROM PUBLIC, anon, authenticated, authenticator, rate_worker, service_role;
GRANT EXECUTE ON FUNCTION rate.store_review_values(jsonb)
  TO service_role, rate_worker;

DO $schedule_deleted_submissions_purge$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed: rate_deleted_review_submissions_purge not scheduled';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rate_deleted_review_submissions_purge') THEN
    PERFORM cron.unschedule('rate_deleted_review_submissions_purge');
  END IF;
  PERFORM cron.schedule(
    'rate_deleted_review_submissions_purge',
    '45 3 * * *',
    $cmd$ SELECT rate.purge_deleted_review_submissions(); $cmd$
  );
END
$schedule_deleted_submissions_purge$;

COMMIT;

-- Validate seller_reply length CHECK outside the DDL transaction so
-- SHARE UPDATE EXCLUSIVE allows concurrent reads/writes while scanning.
DO $validate_seller_reply_len_chk$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'rate.reviews'::pg_catalog.regclass
      AND c.conname = 'rate_reviews_seller_reply_len_chk'
      AND NOT c.convalidated
  ) THEN
    SET LOCAL lock_timeout = '5s';
    ALTER TABLE rate.reviews
      VALIDATE CONSTRAINT rate_reviews_seller_reply_len_chk;
  END IF;
END
$validate_seller_reply_len_chk$;
