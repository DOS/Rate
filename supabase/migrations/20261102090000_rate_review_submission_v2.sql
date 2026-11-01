-- =============================================================================
-- Migration: 20261102090000_rate_review_submission_v2.sql
-- Purpose (DOS/Rate#1544): phase P3 of the DOS/Rate criteria ratings design
-- (DOS/Rate#1531, Docs/Proposals/2026-10-31-criteria-stars-pros-cons.html, sections 2 and
-- 4.2; decisions D1 and D5 approved by JOY on 2026-10-31). It needs P2
-- (20261101120000_rate_criteria_ratings.sql). Copied unchanged from the reviewed DOS/Rate
-- proposal Docs/Proposals/2026-11-01-dos-me-review-submission-v2.sql (DOS/Rate#1568) apart
-- from this header. One transaction.
-- Verify: scripts/ops/rate-review-submission-v2-verify.sql (V1 to V7 return 0).
-- Rollback: scripts/ops/rate-review-submission-v2-rollback.sql.
-- =============================================================================
--
-- What it adds:
--   rate.rating_criteria                the criteria of each category with weights, versioned:
--                                       version 1 equals packages/shared-data/src/rules/
--                                       rating-criteria.ts (the replay test keeps them equal)
--   rate.review_point_compare(text)     the compared form of a line (shared-data comparablePoint)
--   rate.review_point_has_content(text) at least three letters or digits, two of them different
--   rate.review_point_is_evasive_con(text)  a con that only says there is none (shared-data
--                                       isEvasiveCon, the same pattern text)
--   rate.review_text_stored(text)       a line as stored (shared-data storedPoint)
--   rate.review_text_length(text)       its length in characters as the writer sees them
--   rate.submit_community_review_v2(...) a Rate review under D5: criterion stars (half steps,
--                                       the required criterion, at most 2 left out), the review
--                                       star as their weighted average at 0.1, a verdict of 20 to
--                                       300 characters, 1 to 5 pros and cons of 5 to 150
--                                       characters, up to 3 pros and 3 cons per criterion. It
--                                       stores rating_exact, verdict, criteria_version and one
--                                       rate.review_points row per line, in one transaction.
--   review_points_position_key          one row per review, criterion, kind and position
--
-- rate.submit_community_review (v1) is kept unchanged, so the current web form keeps working
-- until P3's web side calls v2; a later migration revokes v1. v2 has its own name rather than an
-- overload: PostgREST cannot choose between two functions of one name by their arguments.
--
-- Same gates as v1 (20261018153000_rate_row_provenance.sql): a signed-in, non-anonymous user or
-- the service role; a crawled listing of the master; one review per user and master; 5 reviews
-- per user in 24 hours; keyword rules that exclude, never include; the review starts excluded
-- from the rating until the analyzer decides. Errors are in Vietnamese with SQLSTATE 22023 and
-- the field in DETAIL ('verdict', 'pros', 'pros.2', 'criteria.battery',
-- 'criterion_points.battery.cons.0'), so the API can point at the field.
--
-- Idempotent: IF NOT EXISTS, ON CONFLICT DO NOTHING for the version 1 rows, CREATE OR REPLACE for
-- functions. One transaction.

BEGIN;

-- 1. rate.rating_criteria -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rate.rating_criteria (
  criteria_version integer  NOT NULL CHECK (criteria_version >= 1),
  category_slug    text     NOT NULL CHECK (category_slug ~ '^[a-z_-]{2,64}$'),
  key              text     NOT NULL CHECK (key ~ '^[a-z_]{2,32}$'),
  weight           smallint NOT NULL CHECK (weight BETWEEN 1 AND 100),
  required         boolean  NOT NULL DEFAULT false,
  position         smallint NOT NULL CHECK (position BETWEEN 0 AND 19),
  PRIMARY KEY (criteria_version, category_slug, key)
);

ALTER TABLE rate.rating_criteria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view rating_criteria" ON rate.rating_criteria;
CREATE POLICY "Public can view rating_criteria" ON rate.rating_criteria FOR SELECT USING (true);
GRANT SELECT ON rate.rating_criteria TO anon, authenticated, rate_worker;
GRANT ALL ON rate.rating_criteria TO service_role;

-- A version never changes once written: a new list is a new version (RATING_CRITERIA_VERSION).
INSERT INTO rate.rating_criteria (criteria_version, category_slug, key, weight, required, position)
VALUES
  (1, 'smartphones', 'performance', 20, false, 0),
  (1, 'smartphones', 'camera', 20, false, 1),
  (1, 'smartphones', 'battery', 20, false, 2),
  (1, 'smartphones', 'display', 15, false, 3),
  (1, 'smartphones', 'design', 10, false, 4),
  (1, 'smartphones', 'value', 15, true, 5),
  (1, 'tablets', 'display', 20, false, 0),
  (1, 'tablets', 'performance', 20, false, 1),
  (1, 'tablets', 'battery', 15, false, 2),
  (1, 'tablets', 'sound', 10, false, 3),
  (1, 'tablets', 'software', 10, false, 4),
  (1, 'tablets', 'design', 10, false, 5),
  (1, 'tablets', 'value', 15, true, 6),
  (1, 'laptops', 'performance', 25, false, 0),
  (1, 'laptops', 'display', 15, false, 1),
  (1, 'laptops', 'battery', 15, false, 2),
  (1, 'laptops', 'keyboard', 10, false, 3),
  (1, 'laptops', 'thermals', 10, false, 4),
  (1, 'laptops', 'design', 10, false, 5),
  (1, 'laptops', 'value', 15, true, 6),
  (1, 'smartwatches', 'health', 25, false, 0),
  (1, 'smartwatches', 'battery', 20, false, 1),
  (1, 'smartwatches', 'design', 15, false, 2),
  (1, 'smartwatches', 'apps', 15, false, 3),
  (1, 'smartwatches', 'display', 10, false, 4),
  (1, 'smartwatches', 'value', 15, true, 5),
  (1, 'earbuds', 'sound', 30, false, 0),
  (1, 'earbuds', 'anc', 15, false, 1),
  (1, 'earbuds', 'battery', 15, false, 2),
  (1, 'earbuds', 'comfort', 15, false, 3),
  (1, 'earbuds', 'calls', 10, false, 4),
  (1, 'earbuds', 'value', 15, true, 5),
  (1, 'services', 'service_quality', 35, false, 0),
  (1, 'services', 'price', 25, true, 1),
  (1, 'services', 'attitude', 20, false, 2),
  (1, 'services', 'speed', 20, false, 3)
ON CONFLICT (criteria_version, category_slug, key) DO NOTHING;

-- 2. One row per review, criterion, kind and position ------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS review_points_position_key
  ON rate.review_points (review_id, COALESCE(criterion_key, ''), kind, position);

-- 3. Line helpers (packages/shared-data/src/rules/review-form.ts) ------------------------------

-- Every helper reads text under the built-in pg_c_utf8 collation (PostgreSQL 17), so lower case
-- and letter classes follow Unicode whatever the database's own locale is. The invisible set is
-- review-form.ts INVISIBLE: format characters (zero-width, bidi marks, flag tags), emoji
-- variation selectors and the keycap mark; the replay test checks every such code point.

-- storedPoint: canonical composition, no invisible characters, trimmed. A line is stored in this
-- form and its length counted on it, so it always fits the review_points length check.
CREATE OR REPLACE FUNCTION rate.review_text_stored(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(normalize(COALESCE(p_text, ''), NFC),
      '[­؀-؅؜۝܏࢐-࢑࣢᠎​-‏‪-‮⁠-⁤⁦-⁯⃣︀-️﻿￹-￻\U000110BD\U000110CD\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0001\U000E0020-\U000E007F\U000E0100-\U000E01EF]',
      '', 'g') COLLATE pg_catalog.pg_c_utf8,
    '^[[:space:]]+|[[:space:]]+$', '', 'g')
$$;

-- Length in characters as the writer sees them: code points of the stored form.
CREATE OR REPLACE FUNCTION rate.review_text_length(p_text text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT char_length(rate.review_text_stored(p_text))
$$;

-- comparablePoint: compatibility composition, no invisible characters, lower case, anything but
-- letters, digits and spaces as a space, spaces collapsed. Diacritics stay: "sạc" and "sắc"
-- differ.
CREATE OR REPLACE FUNCTION rate.review_point_compare(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.btrim(pg_catalog.regexp_replace(
           pg_catalog.regexp_replace(
             pg_catalog.lower(pg_catalog.regexp_replace(normalize(COALESCE(p_text, ''), NFKC),
               '[­؀-؅؜۝܏࢐-࢑࣢᠎​-‏‪-‮⁠-⁤⁦-⁯⃣︀-️﻿￹-￻\U000110BD\U000110CD\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0001\U000E0020-\U000E007F\U000E0100-\U000E01EF]',
               '', 'g') COLLATE pg_catalog.pg_c_utf8),
             '[^[:alnum:][:space:]]+', ' ', 'g'),
           '[[:space:]]+', ' ', 'g'))
$$;

-- hasContent: at least three letters or digits, and not one character repeated.
CREATE OR REPLACE FUNCTION rate.review_point_has_content(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.char_length(c) >= 3
     AND (SELECT count(DISTINCT ch) FROM pg_catalog.regexp_split_to_table(c, '') AS ch) >= 2
  FROM (SELECT pg_catalog.regexp_replace(rate.review_point_compare(p_text) COLLATE pg_catalog.pg_c_utf8,
          '[^[:alnum:]]', '', 'g') AS c) s
$$;

-- isEvasiveCon: no words, or the whole compared line is a dodge ("không có", "chưa thấy gì để
-- chê", "mọi thứ đều ổn", "none", "10/10"). The pattern text equals EVASIVE_CON_PATTERN.
CREATE OR REPLACE FUNCTION rate.review_point_is_evasive_con(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT NOT rate.review_point_has_content(p_text)
      OR rate.review_point_compare(p_text) ~ '^(?:(?:hiện tại|hien tai|tạm thời|tam thoi|đến giờ|den gio|vẫn|van|thì|thi|thực sự|thuc su|thật sự|that su|mình|minh|em|tôi|toi|tui|anh|chị|chi|e|m) )*(?:không|khong|ko|k|kh|khum|chưa|chua|chẳng|chang|chả|cha|hok|hông|hong|hem)(?: (?:có|co|thấy|thay|gặp|gap|phát hiện|phat hien|phát hiện ra|phat hien ra|chê được|che duoc|chê|che))*(?: (?:gì|gi|j|nhược điểm|nhuoc diem|điểm trừ|diem tru|khuyết điểm|khuyet diem|điểm yếu|diem yeu|vấn đề|van de|lỗi|loi|điểm|diem|ý kiến|y kien))*(?:(?: (?:để|de|mà|ma|đáng|dang|phải|phai|cần|can))? (?:chê|che|phàn nàn|phan nan|nói|noi|kể|ke))?(?: (?:cả|ca|hết|het|nào|nao|luôn|luon|ạ|a|nhé|nhe|nha|nhen|đâu|dau))*$|^(?:(?:mọi thứ|moi thu|tất cả|tat ca|all) (?:(?:đều|deu) )?(?:ổn|on|tốt|tot|ok|good|fine)|(?:kcj|no|none|nothing|nothing to complain|nothing to complain about|no con|no cons|no complaint|no complaints|everything is fine|n a|0|ok|ổn|on|tốt|tot|rất tốt|rat tot|tuyệt vời|tuyet voi|hoàn hảo|hoan hao|perfect|10 10|5 sao))$'
$$;

REVOKE ALL ON FUNCTION rate.review_text_stored(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rate.review_text_length(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rate.review_point_compare(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rate.review_point_has_content(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rate.review_point_is_evasive_con(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rate.review_text_stored(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.review_text_length(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.review_point_compare(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.review_point_has_content(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rate.review_point_is_evasive_con(text) TO authenticated, service_role;

-- 4. The lines of one list, checked and normalised ----------------------------------------------

-- A list of pros or cons: a JSON array of strings, each 5 to 150 characters with words in it,
-- no line twice; a con must not dodge. Returns the lines as stored (review_text_stored), in
-- order. p_field names the
-- list in errors ('pros', 'criterion_points.battery.cons').
CREATE OR REPLACE FUNCTION rate.review_point_list(
  p_lines jsonb, p_kind text, p_min integer, p_max integer, p_field text
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_lines text[] := '{}';
  v_seen text[] := '{}';
  v_line text;
  v_compared text;
  v_len integer;
  v_i integer := 0;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) = 'null' THEN
    p_lines := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'Danh sách % không hợp lệ', CASE p_kind WHEN 'pro' THEN 'ưu điểm' ELSE 'nhược điểm' END
      USING ERRCODE = '22023', DETAIL = p_field;
  END IF;
  IF jsonb_array_length(p_lines) < p_min OR jsonb_array_length(p_lines) > p_max THEN
    RAISE EXCEPTION 'Cần từ % đến % %', p_min, p_max,
      CASE p_kind WHEN 'pro' THEN 'ưu điểm' ELSE 'nhược điểm' END
      USING ERRCODE = '22023', DETAIL = p_field;
  END IF;
  FOR v_i IN 0 .. jsonb_array_length(p_lines) - 1 LOOP
    IF jsonb_typeof(p_lines -> v_i) <> 'string' THEN
      RAISE EXCEPTION 'Mỗi dòng phải là chữ' USING ERRCODE = '22023', DETAIL = p_field || '.' || v_i;
    END IF;
    v_line := rate.review_text_stored(p_lines ->> v_i);
    v_len := rate.review_text_length(v_line);
    IF v_len < 5 OR v_len > 150 THEN
      RAISE EXCEPTION 'Mỗi dòng từ 5 đến 150 ký tự' USING ERRCODE = '22023', DETAIL = p_field || '.' || v_i;
    END IF;
    IF p_kind = 'pro' AND NOT rate.review_point_has_content(v_line) THEN
      RAISE EXCEPTION 'Dòng này chưa có nội dung' USING ERRCODE = '22023', DETAIL = p_field || '.' || v_i;
    END IF;
    IF p_kind = 'con' AND rate.review_point_is_evasive_con(v_line) THEN
      RAISE EXCEPTION 'Hãy ghi một điểm chưa tốt cụ thể, kể cả điểm nhỏ'
        USING ERRCODE = '22023', DETAIL = p_field || '.' || v_i;
    END IF;
    v_compared := rate.review_point_compare(v_line);
    IF v_compared = ANY (v_seen) THEN
      RAISE EXCEPTION 'Dòng này bị trùng' USING ERRCODE = '22023', DETAIL = p_field || '.' || v_i;
    END IF;
    v_seen := v_seen || v_compared;
    v_lines := v_lines || v_line;
  END LOOP;
  RETURN v_lines;
END;
$$;

REVOKE ALL ON FUNCTION rate.review_point_list(jsonb, text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rate.review_point_list(jsonb, text, integer, integer, text)
  TO authenticated, service_role;

-- 5. rate.submit_community_review_v2 -----------------------------------------------------------

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
  v_claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
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

  -- The gates of v1: a signed-in, non-anonymous user, or the service role.
  IF v_uid IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để gửi đánh giá' USING ERRCODE = '42501';
  END IF;
  IF NOT v_is_service AND COALESCE(v_claims ->> 'is_anonymous', 'false') = 'true' THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập bằng tài khoản thật để gửi đánh giá' USING ERRCODE = '42501';
  END IF;
  IF p_master_product_id IS NULL THEN
    RAISE EXCEPTION 'master_product_id is required' USING ERRCODE = '22023', DETAIL = 'master_product_id';
  END IF;

  -- The master's category and its newest criteria list. A category with no list is refused
  -- rather than rated as a phone (shared-data hasRatingCriteria).
  SELECT c.slug INTO v_category
  FROM rate.master_products m
  LEFT JOIN rate.categories c ON c.id = m.category_id
  WHERE m.id = p_master_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy sản phẩm' USING ERRCODE = 'P0002', DETAIL = 'master_product_id';
  END IF;
  SELECT max(criteria_version) INTO v_version
  FROM rate.rating_criteria WHERE category_slug = v_category;
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'Danh mục này chưa có tiêu chí chấm điểm' USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;

  -- Criterion stars (D5): keys of the list only, 1 to 5 in half steps, the required criterion
  -- given, at most 2 left out. The review star is their weighted average at 0.1.
  IF p_criteria_ratings IS NULL OR jsonb_typeof(p_criteria_ratings) <> 'object' THEN
    RAISE EXCEPTION 'Hãy chấm điểm các tiêu chí' USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_criteria_ratings) LOOP
    IF NOT EXISTS (SELECT 1 FROM rate.rating_criteria
                   WHERE criteria_version = v_version AND category_slug = v_category AND key = v_key) THEN
      RAISE EXCEPTION 'Tiêu chí không thuộc danh mục này' USING ERRCODE = '22023', DETAIL = 'criteria.' || left(v_key, 40);
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
    IF v_star < 1 OR v_star > 5 OR v_star * 2 <> trunc(v_star * 2) THEN
      RAISE EXCEPTION 'Số sao phải từ 1 đến 5, bước 0,5' USING ERRCODE = '22023', DETAIL = 'criteria.' || v_criterion.key;
    END IF;
    v_star := round(v_star, 1);
    v_clean_criteria := v_clean_criteria || jsonb_build_object(v_criterion.key, v_star);
    v_weighted := v_weighted + v_star * v_criterion.weight;
    v_weights := v_weights + v_criterion.weight;
  END LOOP;
  IF v_skipped > 2 THEN
    RAISE EXCEPTION 'Chỉ được bỏ qua tối đa 2 tiêu chí' USING ERRCODE = '22023', DETAIL = 'criteria';
  END IF;
  v_rating_exact := round(v_weighted / v_weights, 1);
  v_rating_star := round(v_rating_exact)::smallint;

  -- Verdict, 20 to 300 characters with words in it.
  v_verdict := rate.review_text_stored(p_verdict);
  v_verdict_len := rate.review_text_length(v_verdict);
  IF v_verdict_len < 20 OR v_verdict_len > 300 THEN
    RAISE EXCEPTION 'Phần kết luận cần từ 20 đến 300 ký tự' USING ERRCODE = '22023', DETAIL = 'verdict';
  END IF;
  IF NOT rate.review_point_has_content(v_verdict) THEN
    RAISE EXCEPTION 'Phần kết luận chưa có nội dung' USING ERRCODE = '22023', DETAIL = 'verdict';
  END IF;

  -- Pros and cons of the whole review: 1 to 5 each; no line in both lists.
  v_pros := rate.review_point_list(p_pros, 'pro', 1, 5, 'pros');
  v_cons := rate.review_point_list(p_cons, 'con', 1, 5, 'cons');
  FOR v_i IN 1 .. array_length(v_cons, 1) LOOP
    IF rate.review_point_compare(v_cons[v_i]) IN (SELECT rate.review_point_compare(x) FROM unnest(v_pros) x) THEN
      RAISE EXCEPTION 'Một dòng không thể vừa là ưu điểm vừa là nhược điểm'
        USING ERRCODE = '22023', DETAIL = 'cons.' || (v_i - 1);
    END IF;
  END LOOP;

  -- Pros and cons of one criterion: optional, up to 3 each, criteria of the list only.
  IF p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'Ưu nhược theo tiêu chí không hợp lệ' USING ERRCODE = '22023', DETAIL = 'criterion_points';
  END IF;
  IF p_criterion_points IS NOT NULL AND jsonb_typeof(p_criterion_points) = 'object' THEN
    FOR v_key, v_points IN SELECT * FROM jsonb_each(p_criterion_points) LOOP
      IF NOT EXISTS (SELECT 1 FROM rate.rating_criteria
                     WHERE criteria_version = v_version AND category_slug = v_category AND key = v_key) THEN
        RAISE EXCEPTION 'Tiêu chí không thuộc danh mục này'
          USING ERRCODE = '22023', DETAIL = 'criterion_points.' || left(v_key, 40);
      END IF;
      IF jsonb_typeof(v_points) <> 'object' THEN
        RAISE EXCEPTION 'Ưu nhược theo tiêu chí không hợp lệ'
          USING ERRCODE = '22023', DETAIL = 'criterion_points.' || v_key;
      END IF;
      v_cr_pros := rate.review_point_list(v_points -> 'pros', 'pro', 0, 3, 'criterion_points.' || v_key || '.pros');
      v_cr_cons := rate.review_point_list(v_points -> 'cons', 'con', 0, 3, 'criterion_points.' || v_key || '.cons');
      FOR v_i IN 1 .. COALESCE(array_length(v_cr_cons, 1), 0) LOOP
        IF rate.review_point_compare(v_cr_cons[v_i]) IN (SELECT rate.review_point_compare(x) FROM unnest(v_cr_pros) x) THEN
          RAISE EXCEPTION 'Một dòng không thể vừa là ưu điểm vừa là nhược điểm'
            USING ERRCODE = '22023', DETAIL = 'criterion_points.' || v_key || '.cons.' || (v_i - 1);
        END IF;
      END LOOP;
      v_criterion_lines := v_criterion_lines || jsonb_build_object('key', v_key, 'pros', to_jsonb(v_cr_pros), 'cons', to_jsonb(v_cr_cons));
    END LOOP;
  END IF;

  -- The free text is optional; without it the verdict is the review's comment, so readers of v1
  -- reviews and the analyzer always have text.
  v_comment := rate.review_text_stored(p_comment);
  v_comment_len := char_length(v_comment);
  IF v_comment_len > 3000 THEN
    RAISE EXCEPTION 'Nội dung đánh giá tối đa 3000 ký tự' USING ERRCODE = '22023', DETAIL = 'comment';
  END IF;
  IF v_comment_len = 0 THEN
    v_comment := v_verdict;
  END IF;

  v_clean_author := left(btrim(COALESCE(p_author_name, '')), 80);
  IF char_length(v_clean_author) < 2 THEN
    v_clean_author := 'Người dùng Rate.vn';
  END IF;
  v_clean_variation := NULLIF(left(btrim(COALESCE(p_variation, '')), 120), '');
  v_clean_type := CASE WHEN p_reviewer_type = 'expert' AND v_is_service THEN 'expert' ELSE 'user' END;

  -- Only a crawled listing of the master, as v1.
  SELECT id INTO v_product_id
  FROM rate.products
  WHERE cluster_id = p_master_product_id AND origin = 'crawl'
  ORDER BY price_current ASC NULLS LAST, created_at ASC
  LIMIT 1;
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy listing liên kết cho sản phẩm chuẩn hóa này' USING ERRCODE = 'P0002';
  END IF;

  IF v_uid IS NOT NULL THEN
    -- The same lock key as v1, so v1 and v2 submissions of one user are serialized together.
    PERFORM pg_advisory_xact_lock(hashtextextended('rate.submit_community_review:' || v_uid::text, 0));
    IF EXISTS (
      SELECT 1 FROM rate.review_authors a
      JOIN rate.reviews r ON r.id = a.review_id
      JOIN rate.products p ON p.id = r.product_id
      WHERE a.author_user_id = v_uid AND p.cluster_id = p_master_product_id
    ) THEN
      RAISE EXCEPTION 'Bạn đã gửi đánh giá cho sản phẩm này' USING ERRCODE = '23505';
    END IF;
    SELECT count(*) INTO v_recent FROM rate.review_authors
    WHERE author_user_id = v_uid AND created_at > now() - interval '24 hours';
    IF v_recent >= 5 THEN
      RAISE EXCEPTION 'Bạn đã gửi quá 5 đánh giá trong 24 giờ, vui lòng thử lại sau' USING ERRCODE = '54000';
    END IF;
  END IF;

  -- v1's keyword rules, over every line the writer wrote. They only exclude.
  v_all_text := concat_ws(E'\n', v_comment, v_verdict, array_to_string(v_pros, E'\n'), array_to_string(v_cons, E'\n'),
    (SELECT string_agg(line, E'\n') FROM jsonb_array_elements(v_criterion_lines) e,
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
    v_product_id, 'rate_comm_' || replace(gen_random_uuid()::text, '-', ''), v_clean_author,
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

  -- No rating refresh: an excluded review cannot change the rating.
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
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rate.submit_community_review_v2(uuid, jsonb, text, jsonb, jsonb, jsonb, text, text, text, text)
  TO authenticated, service_role;

COMMIT;
