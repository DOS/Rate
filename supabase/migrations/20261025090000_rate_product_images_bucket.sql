-- Rate.vn product image mirror (DOS/Rate#887).
--
-- Some marketplace CDNs refuse images to pages on rate.vn (hotlink
-- protection), and listings lose their pictures when a marketplace removes
-- them. Rate-Services copies a listing's first images into this bucket at
-- crawl time and stores the public URLs on rate.products.images.
--
-- Public bucket: rate.vn serves the objects through the Storage public URL,
-- which does not consult RLS. Only service_role (Rate-Services) writes. The
-- restrictive fences keep anon and authenticated from listing, writing or
-- deleting objects here even when a broad Storage policy exists.
-- Idempotent: replays are no-ops, and a bucket or fence that differs from this
-- definition fails the deployment instead of being silently widened.
-- CREATE POLICY locks storage.objects, which every product on the shared
-- project uses: give up after 5s rather than queue Storage behind a blocker.
BEGIN;
SET LOCAL lock_timeout = '5s';

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rate-product-images', 'rate-product-images', true, 2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']) ON CONFLICT (id) DO NOTHING;

DO $bucket$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'rate-product-images' AND name = 'rate-product-images'
    AND public = true AND file_size_limit = 2097152
    AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']) THEN
    RAISE EXCEPTION 'RATE_IMAGE_BUCKET_CONFIGURATION_MISMATCH';
  END IF;
END;
$bucket$;

DO $storage_policies$
DECLARE v_expected record; v_policy record; v_relation regclass; v_roles oid[];
BEGIN
  SELECT array_agg(oid ORDER BY oid) INTO v_roles FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated');
  FOR v_expected IN SELECT * FROM (VALUES
    ('objects', 'rate_product_images_server_only', 'bucket_id'),
    ('buckets', 'rate_product_image_bucket_server_only', 'id')) AS x(table_name, policy_name, column_name)
  LOOP
    v_relation := to_regclass('storage.' || v_expected.table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid = v_relation AND relrowsecurity) THEN
      RAISE EXCEPTION 'RATE_IMAGE_STORAGE_RLS_REQUIRED';
    END IF;
    SELECT * INTO v_policy FROM pg_catalog.pg_policy WHERE polrelid = v_relation AND polname = v_expected.policy_name;
    IF NOT FOUND THEN
      EXECUTE format('CREATE POLICY %I ON storage.%I AS RESTRICTIVE FOR ALL TO anon, authenticated
        USING (%I <> ''rate-product-images'') WITH CHECK (%I <> ''rate-product-images'')',
        v_expected.policy_name, v_expected.table_name, v_expected.column_name, v_expected.column_name);
    ELSE
      IF v_policy.polpermissive OR v_policy.polcmd <> '*' OR cardinality(v_policy.polroles) <> 2
        OR NOT v_policy.polroles @> v_roles
        OR regexp_replace(pg_catalog.pg_get_expr(v_policy.polqual, v_relation), '[[:space:]()]', '', 'g')
          IS DISTINCT FROM v_expected.column_name || '<>''rate-product-images''::text'
        OR regexp_replace(pg_catalog.pg_get_expr(v_policy.polwithcheck, v_relation), '[[:space:]()]', '', 'g')
          IS DISTINCT FROM v_expected.column_name || '<>''rate-product-images''::text' THEN
        RAISE EXCEPTION 'RATE_IMAGE_STORAGE_POLICY_MISMATCH';
      END IF;
    END IF;
  END LOOP;
END;
$storage_policies$;
COMMIT;
