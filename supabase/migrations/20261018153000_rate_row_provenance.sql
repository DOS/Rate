-- =============================================================================
-- Migration: 20261018153000_rate_row_provenance.sql
-- Purpose (Rate audit K2): record where every listing, review and price point
-- came from, so real and fabricated data can be told apart in SQL instead of
-- by ID-prefix heuristics and hard-coded seed lists.
--
--   1. origin on rate.products, rate.reviews and rate.price_history
--      ('crawl' | 'community' | 'seed' | 'synthetic' | 'fixture' | 'backfill').
--      The crawler is the only bulk writer, so new rows default to 'crawl';
--      community reviews are labelled by a trigger.
--   2. Crawl lineage: products.last_crawled_at / last_crawl_job_id,
--      price_history.crawl_job_id, reviews.first_seen_job_id + observed_at,
--      stamped by rate.stamp_crawl_provenance() from the queue worker.
--      No FK to crawl_jobs: terminal jobs are purged after the retention
--      window (purge_completed_crawl_jobs) and the id must outlive them.
--   3. master_products.spec_provenance: per-source record of where the
--      specifications came from (filled from key_specs.spec_source for now).
--   4. Public reads (RLS + the merchant-trust view) and the price / rating
--      aggregates only use crawled listings and crawled or community reviews.
--   5. Backfill from the existing conventions: syn-* listings, syn-rv-* /
--      bf-rv-* reviews, rate_comm_* community reviews, *_backfill prices,
--      localhost and the scraper suite's fixture URLs. Re-running only
--      touches rows still 'crawl'. Hand-written seed rows need no label: the
--      owner-approved purge (Rate-Services 983d136, 9068be4) deleted every
--      seed row that no finished crawl job also matched, so the seed ids left
--      were verified by a crawl.
--   6. New rows inherit a non-crawl parent listing's origin, syn-* ids are
--      always labelled synthetic, and community reviews and price dedupe only
--      look at crawled listings / price points.
-- =============================================================================

-- Fail fast instead of queueing behind long transactions on the shared database.
SET lock_timeout = '5s';

-- 1. Columns ---------------------------------------------------------------

ALTER TABLE rate.products
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'crawl',
  ADD COLUMN IF NOT EXISTS last_crawled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_crawl_job_id UUID;

ALTER TABLE rate.reviews
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'crawl',
  -- Existing reviews get -infinity (unknown), so the stamp window below can
  -- never claim them; only rows written after this migration get now().
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ NOT NULL DEFAULT '-infinity',
  ADD COLUMN IF NOT EXISTS first_seen_job_id UUID;

ALTER TABLE rate.reviews ALTER COLUMN observed_at SET DEFAULT now();

ALTER TABLE rate.price_history
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'crawl',
  ADD COLUMN IF NOT EXISTS crawl_job_id UUID;

ALTER TABLE rate.master_products
  ADD COLUMN IF NOT EXISTS spec_provenance JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.products'::regclass AND conname = 'products_origin_check') THEN
    ALTER TABLE rate.products ADD CONSTRAINT products_origin_check
      CHECK (origin IN ('crawl', 'seed', 'synthetic', 'fixture', 'backfill'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.reviews'::regclass AND conname = 'reviews_origin_check') THEN
    ALTER TABLE rate.reviews ADD CONSTRAINT reviews_origin_check
      CHECK (origin IN ('crawl', 'community', 'seed', 'synthetic', 'fixture', 'backfill'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.price_history'::regclass AND conname = 'price_history_origin_check') THEN
    ALTER TABLE rate.price_history ADD CONSTRAINT price_history_origin_check
      CHECK (origin IN ('crawl', 'seed', 'synthetic', 'fixture', 'backfill'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate.master_products'::regclass AND conname = 'master_products_spec_provenance_object') THEN
    ALTER TABLE rate.master_products ADD CONSTRAINT master_products_spec_provenance_object
      CHECK (jsonb_typeof(spec_provenance) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN rate.products.origin IS 'Where the listing came from. Only crawl rows are public.';
COMMENT ON COLUMN rate.products.last_crawl_job_id IS 'rate.crawl_jobs id of the last crawl that refreshed this listing. No FK: jobs are purged after retention.';
COMMENT ON COLUMN rate.reviews.origin IS 'Where the review came from. crawl and community rows are public.';
COMMENT ON COLUMN rate.reviews.observed_at IS 'When Rate first stored the review; -infinity for reviews stored before 20261018153000 (platform_created_at is the platform''s own date).';
COMMENT ON COLUMN rate.reviews.first_seen_job_id IS 'rate.crawl_jobs id of the crawl that first stored this review. No FK: jobs are purged after retention.';
COMMENT ON COLUMN rate.price_history.crawl_job_id IS 'rate.crawl_jobs id of the crawl that observed this price. No FK: jobs are purged after retention.';
COMMENT ON COLUMN rate.master_products.spec_provenance IS 'Per-source provenance of specifications, e.g. {"source": "verified_benchmark"}.';

CREATE INDEX IF NOT EXISTS idx_rate_products_origin_not_crawl
  ON rate.products (origin) WHERE origin <> 'crawl';
CREATE INDEX IF NOT EXISTS idx_rate_reviews_origin_not_crawl
  ON rate.reviews (origin) WHERE origin <> 'crawl';
CREATE INDEX IF NOT EXISTS idx_rate_price_history_crawl_job
  ON rate.price_history (crawl_job_id) WHERE crawl_job_id IS NOT NULL;

-- 2. Community reviews label themselves ------------------------------------

CREATE OR REPLACE FUNCTION rate.reviews_set_origin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_parent TEXT;
BEGIN
  -- rate.submit_community_review is the only writer of rate_comm_* ids.
  IF NEW.platform_review_id LIKE 'rate\_comm\_%' THEN
    NEW.origin := 'community';
  ELSIF NEW.origin = 'community' THEN
    RAISE EXCEPTION 'origin community is reserved for rate.submit_community_review'
      USING ERRCODE = '22023';
  ELSIF NEW.platform_review_id LIKE 'syn-rv-%' OR NEW.platform_review_id LIKE 'bf-rv-%' THEN
    -- The synthetic / backfilled review id conventions are never public.
    NEW.origin := 'synthetic';
  ELSIF NEW.origin = 'crawl' THEN
    -- A review on a fabricated listing is fabricated too.
    SELECT p.origin INTO v_parent FROM rate.products p WHERE p.id = NEW.product_id;
    IF v_parent IS NOT NULL AND v_parent <> 'crawl' THEN
      NEW.origin := v_parent;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_set_origin ON rate.reviews;
CREATE TRIGGER trg_reviews_set_origin
  BEFORE INSERT OR UPDATE OF platform_review_id, origin ON rate.reviews
  FOR EACH ROW EXECUTE FUNCTION rate.reviews_set_origin();

REVOKE ALL ON FUNCTION rate.reviews_set_origin() FROM PUBLIC, anon, authenticated;

-- syn-* listing ids are the synthetic-offer convention: never public.
CREATE OR REPLACE FUNCTION rate.products_set_origin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.platform_item_id LIKE 'syn-%' THEN
    NEW.origin := 'synthetic';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_set_origin ON rate.products;
CREATE TRIGGER trg_products_set_origin
  BEFORE INSERT OR UPDATE OF platform_item_id, origin ON rate.products
  FOR EACH ROW EXECUTE FUNCTION rate.products_set_origin();

REVOKE ALL ON FUNCTION rate.products_set_origin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION rate.price_history_inherit_origin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_parent TEXT;
BEGIN
  IF NEW.origin = 'crawl' THEN
    SELECT p.origin INTO v_parent FROM rate.products p WHERE p.id = NEW.product_id;
    IF v_parent IS NOT NULL AND v_parent <> 'crawl' THEN
      NEW.origin := v_parent;
    ELSIF NEW.source LIKE '%\_backfill' THEN
      -- *_backfill sources are reconstructed, not observed.
      NEW.origin := 'backfill';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_history_inherit_origin ON rate.price_history;
CREATE TRIGGER trg_price_history_inherit_origin
  BEFORE INSERT ON rate.price_history
  FOR EACH ROW EXECUTE FUNCTION rate.price_history_inherit_origin();

REVOKE ALL ON FUNCTION rate.price_history_inherit_origin() FROM PUBLIC, anon, authenticated;

-- 3. Backfill (idempotent: only rows still on the 'crawl' default move) -----

UPDATE rate.products
SET origin = 'synthetic'
WHERE origin = 'crawl' AND platform_item_id LIKE 'syn-%';

UPDATE rate.products
SET origin = 'fixture'
WHERE origin = 'crawl'
  AND (
    url ~* '^https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?(/|$)'
    -- TEST_FIXTURE_LISTING_URLS in Rate-Services src/scrapers/fabricated-seed-ids.ts
    OR url IN (
      'https://tiki.vn/dien-thoai-samsung-galaxy-s24-ultra-5g-p274819201.html',
      'https://www.lazada.vn/products/samsung-galaxy-s24-ultra-i284910293.html'
    )
  );

UPDATE rate.reviews
SET origin = 'community'
WHERE origin = 'crawl' AND platform_review_id LIKE 'rate\_comm\_%';

UPDATE rate.reviews
SET origin = 'synthetic'
WHERE origin = 'crawl'
  AND (platform_review_id LIKE 'syn-rv-%' OR platform_review_id LIKE 'bf-rv-%');

UPDATE rate.reviews r
SET origin = p.origin
FROM rate.products p
WHERE r.product_id = p.id
  AND r.origin = 'crawl'
  AND p.origin IN ('synthetic', 'fixture');

UPDATE rate.price_history
SET origin = 'backfill'
WHERE origin = 'crawl' AND source LIKE '%\_backfill';

UPDATE rate.price_history h
SET origin = p.origin
FROM rate.products p
WHERE h.product_id = p.id
  AND h.origin = 'crawl'
  AND p.origin IN ('synthetic', 'fixture');

UPDATE rate.master_products
SET spec_provenance = jsonb_build_object('source', key_specs ->> 'spec_source')
WHERE spec_provenance = '{}'::jsonb
  AND key_specs IS NOT NULL
  AND jsonb_typeof(key_specs) = 'object'
  AND COALESCE(key_specs ->> 'spec_source', '') <> '';

-- 4. Crawl lineage stamp, called by the queue worker before it acks a job ---

CREATE OR REPLACE FUNCTION rate.stamp_crawl_provenance(p_job_id UUID, p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prices INTEGER;
  v_reviews INTEGER;
BEGIN
  IF p_job_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'job id and product id are required' USING ERRCODE = '22023';
  END IF;

  -- Only a job that is currently being processed may stamp rows.
  IF NOT EXISTS (
    SELECT 1 FROM rate.crawl_jobs WHERE id = p_job_id AND status = 'running'
  ) THEN
    RAISE EXCEPTION 'crawl job % is not running', p_job_id USING ERRCODE = 'P0002';
  END IF;

  -- The job must be for this listing: same platform, and the same item id or
  -- URL when the job carries them (URL-only discovery jobs have no item id).
  UPDATE rate.products p
  SET last_crawled_at = now(),
      last_crawl_job_id = p_job_id
  FROM rate.crawl_jobs j
  WHERE p.id = p_product_id
    AND p.origin = 'crawl'
    AND j.id = p_job_id
    AND j.platform = p.platform
    AND (
      j.platform_item_id = p.platform_item_id
      OR j.target_url = p.url
      OR j.platform_item_id IS NULL
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'crawled listing % not found for job %', p_product_id, p_job_id USING ERRCODE = 'P0002';
  END IF;

  -- Rows this job just wrote: the dedupe index keeps one live job per
  -- listing, and one job runs for minutes, so the 1h window cannot reach a
  -- previous crawl's rows (those are already stamped or predate this column).
  UPDATE rate.price_history
  SET crawl_job_id = p_job_id
  WHERE product_id = p_product_id
    AND crawl_job_id IS NULL
    AND origin = 'crawl'
    AND recorded_at > now() - interval '1 hour';
  GET DIAGNOSTICS v_prices = ROW_COUNT;

  UPDATE rate.reviews
  SET first_seen_job_id = p_job_id
  WHERE product_id = p_product_id
    AND first_seen_job_id IS NULL
    AND origin = 'crawl'
    AND observed_at > now() - interval '1 hour';
  GET DIAGNOSTICS v_reviews = ROW_COUNT;

  RETURN jsonb_build_object('price_points', v_prices, 'reviews', v_reviews);
END;
$$;

REVOKE ALL ON FUNCTION rate.stamp_crawl_provenance(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.stamp_crawl_provenance(UUID, UUID) TO service_role;

-- 5. Public reads only see crawled data -------------------------------------

DROP POLICY IF EXISTS "Public can view products" ON rate.products;
CREATE POLICY "Public can view products" ON rate.products
  FOR SELECT USING (origin = 'crawl');

DROP POLICY IF EXISTS "Public can view price_history" ON rate.price_history;
CREATE POLICY "Public can view price_history" ON rate.price_history
  FOR SELECT USING (origin = 'crawl');

DROP POLICY IF EXISTS "Public can view reviews" ON rate.reviews;
CREATE POLICY "Public can view reviews" ON rate.reviews
  FOR SELECT USING (origin IN ('crawl', 'community'));

-- The subquery runs under the caller's rate.reviews policy above.
DROP POLICY IF EXISTS "Public can view review_flags" ON rate.review_flags;
CREATE POLICY "Public can view review_flags" ON rate.review_flags
  FOR SELECT USING (EXISTS (SELECT 1 FROM rate.reviews r WHERE r.id = review_flags.review_id));

-- Owner-rights view (see 20261018120102 T4), so RLS does not apply: filter here.
CREATE OR REPLACE VIEW rate.v_products_with_merchant_trust AS
SELECT
  p.id,
  p.merchant_id,
  p.platform,
  p.platform_item_id,
  p.title,
  p.description,
  p.category_id,
  p.brand,
  p.price_current,
  p.price_original,
  p.price_min,
  p.price_max,
  p.currency,
  p.historical_sold,
  p.stock,
  p.rating_star,
  p.rating_count,
  p.images,
  p.models,
  p.attributes,
  p.url,
  p.cluster_id,
  p.metadata,
  p.created_at,
  p.updated_at,
  m.name AS merchant_name,
  m.is_official AS merchant_is_official,
  m.location AS merchant_location,
  GREATEST(
    COALESCE(t.risk_score::integer, 0),
    COALESCE(m.risk_score, 0),
    COALESCE(m.review_risk_score, 0)
  ) AS threat_risk_score,
  t.category AS threat_category,
  t.source AS threat_source,
  COALESCE(t.risk_score::integer, m.risk_score, 0) AS dosafe_risk_score,
  COALESCE(m.review_risk_score, 0) AS review_risk_score,
  COALESCE(m.review_risk_breakdown, '{}'::jsonb) AS review_risk_breakdown
FROM rate.products p
JOIN rate.merchants m ON p.merchant_id = m.id
LEFT JOIN dosafe.threat_intel t ON t.entity_hash = m.entity_hash
WHERE p.origin = 'crawl';

GRANT SELECT ON rate.v_products_with_merchant_trust TO anon, authenticated, service_role;

-- 6. Aggregates only count crawled listings and crawled/community reviews ----

CREATE OR REPLACE FUNCTION rate.refresh_master_market_stats(p_master_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE rate.master_products m
  SET min_price = s.min_price,
      max_price = s.max_price,
      merchant_count = COALESCE(s.merchant_count, 0),
      updated_at = now()
  FROM (
    SELECT
      MIN(p.price_current) FILTER (WHERE p.price_current > 0) AS min_price,
      MAX(COALESCE(NULLIF(p.price_max, 0), p.price_current)) FILTER (WHERE p.price_current > 0) AS max_price,
      COUNT(DISTINCT p.merchant_id) FILTER (WHERE p.price_current > 0)::INTEGER AS merchant_count
    FROM rate.products p
    WHERE p.cluster_id = p_master_id
      AND p.origin = 'crawl'
  ) s
  WHERE m.id = p_master_id;
$$;

REVOKE ALL ON FUNCTION rate.refresh_master_market_stats(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.refresh_master_market_stats(UUID) TO service_role;

CREATE OR REPLACE FUNCTION rate.refresh_master_product_rating(p_master_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE rate.master_products m
  SET user_rating_weighted = COALESCE(s.weighted, 0),
      authentic_review_count = COALESCE(s.n, 0),
      updated_at = now()
  FROM (
    SELECT
      round(
        (sum(r.rating_star * r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'))
        / NULLIF(sum(r.helpfulness_weight) FILTER (WHERE r.reviewer_type = 'user'), 0),
        2
      ) AS weighted,
      (count(*) FILTER (WHERE r.reviewer_type = 'user'))::INTEGER AS n
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
  WHERE m.id = p_master_id;
$$;

REVOKE EXECUTE ON FUNCTION rate.refresh_master_product_rating(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.refresh_master_product_rating(UUID) TO service_role;

-- 7. Writers that pick or compare rows only use crawled ones ----------------
-- Bodies copied from 20261018100000 and 20261018120106; only the origin
-- filter is new.

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

  -- Only a crawled listing: a review on a fabricated one is hidden (20261018153000).
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

REVOKE ALL ON FUNCTION rate.submit_community_review(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rate.submit_community_review(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION rate.record_price_observation(
  p_product_id UUID,
  p_price NUMERIC,
  p_price_original NUMERIC DEFAULT NULL,
  p_source TEXT DEFAULT 'shopee_crawler',
  p_observation_id TEXT DEFAULT NULL,
  p_promotion_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prev_price NUMERIC;
  v_prev_original NUMERIC;
  v_prev_recorded TIMESTAMPTZ;
  v_origin TEXT;
  v_inserted INTEGER := 0;
BEGIN
  IF p_product_id IS NULL OR p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Invalid product_id or negative price in record_price_observation'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.origin INTO v_origin FROM rate.products p WHERE p.id = p_product_id;
  v_origin := COALESCE(v_origin, 'crawl');

  SELECT ph.price, ph.price_original, ph.recorded_at
  INTO v_prev_price, v_prev_original, v_prev_recorded
  FROM rate.price_history ph
  WHERE ph.product_id = p_product_id
    -- Dedupe against points of the listing's own origin (20261018153000):
    -- public (crawled) points for a crawled listing, so hidden backfill or
    -- synthetic points never suppress a real observation.
    AND ph.origin = v_origin
  ORDER BY ph.recorded_at DESC
  LIMIT 1;

  IF v_prev_recorded IS NOT NULL
     AND v_prev_price = p_price
     AND COALESCE(v_prev_original, 0) = COALESCE(p_price_original, 0)
     AND v_prev_recorded > pg_catalog.now() - INTERVAL '7 days'
  THEN
    RETURN 'unchanged_delta';
  END IF;

  IF p_observation_id IS NOT NULL THEN
    INSERT INTO rate.price_history (
      product_id,
      observation_id,
      price,
      price_original,
      recorded_at,
      source,
      promotion_id
    )
    VALUES (
      p_product_id,
      p_observation_id,
      p_price,
      p_price_original,
      pg_catalog.now(),
      COALESCE(NULLIF(pg_catalog.btrim(p_source), ''), 'shopee_crawler'),
      p_promotion_id
    )
    ON CONFLICT (observation_id) WHERE observation_id IS NOT NULL DO NOTHING;
  ELSE
    INSERT INTO rate.price_history (
      product_id,
      price,
      price_original,
      recorded_at,
      source,
      promotion_id
    )
    VALUES (
      p_product_id,
      p_price,
      p_price_original,
      pg_catalog.now(),
      COALESCE(NULLIF(pg_catalog.btrim(p_source), ''), 'shopee_crawler'),
      p_promotion_id
    );
  END IF;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    RETURN 'inserted';
  END IF;
  RETURN 'deduped_conflict';
END;
$$;

REVOKE ALL ON FUNCTION rate.record_price_observation(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate.record_price_observation(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID) TO service_role;

-- Community reviews already attached to a fabricated listing move to the
-- master's cheapest crawled listing, when it has one.
UPDATE rate.reviews r
SET product_id = target.id
FROM rate.products bad
JOIN LATERAL (
  SELECT c.id
  FROM rate.products c
  WHERE c.cluster_id = bad.cluster_id
    AND c.origin = 'crawl'
  ORDER BY c.price_current ASC NULLS LAST, c.created_at ASC
  LIMIT 1
) target ON true
WHERE r.product_id = bad.id
  AND r.origin = 'community'
  AND bad.origin <> 'crawl'
  AND bad.cluster_id IS NOT NULL;

-- 8. Recompute the cached prices and ratings of every master that had a
-- fabricated listing or review, so public pages stop showing them.
DO $$
DECLARE
  v_master UUID;
BEGIN
  -- Both branches use the partial origin indexes created above.
  FOR v_master IN
    SELECT p.cluster_id
    FROM rate.products p
    WHERE p.origin <> 'crawl' AND p.cluster_id IS NOT NULL
    UNION
    SELECT p.cluster_id
    FROM rate.reviews r
    JOIN rate.products p ON p.id = r.product_id
    WHERE r.origin <> 'crawl' AND r.origin <> 'community' AND p.cluster_id IS NOT NULL
  LOOP
    PERFORM rate.refresh_master_market_stats(v_master);
    PERFORM rate.refresh_master_product_rating(v_master);
  END LOOP;
END $$;

RESET lock_timeout;
