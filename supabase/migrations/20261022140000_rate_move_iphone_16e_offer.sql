-- Rate (DOS/Rate#594): a CellphoneS "iPhone 16e 128GB" offer was clustered
-- into the "Apple iPhone 16 128GB" master product (before the 16e parse fix,
-- DOS/Rate#352). It pulled the iPhone 16 price floor to 13.69M and showed a
-- false -43% deal on rate.vn/deals. JOY approved moving it (2026-10-22).
--
-- This moves that one offer to an "Apple iPhone 16e 128GB" master product,
-- creating it as the importer would (model_key apple:iphone-16e:128gb), then
-- refreshes price and rating stats of both masters. The offer's crawled
-- reviews, price history and review analysis stay keyed by the product id and
-- move with it. Community reviews stored on it were written for the iPhone 16
-- master and stay there, on its cheapest other crawled listing.
--
-- Data only, rate schema only. Idempotent: on a database without the offer
-- (Preview, Beta) it changes nothing; once moved, a re-run only refreshes the
-- stats. Fails closed if the offer or the iPhone 16 master is not what it
-- expects.

SELECT pg_catalog.set_config('lock_timeout', '5s', true);

DO $$
DECLARE
  c_offer CONSTANT UUID := 'b6f84fe3-8a9f-4775-abac-5400cf69efef';
  c_iphone_16 CONSTANT UUID := '3afb2a7a-d791-4763-8ef6-842ee01bfd48';
  c_model_key CONSTANT TEXT := 'apple:iphone-16e:128gb';
  c_slug CONSTANT TEXT := 'apple-iphone-16e-128gb';
  v_offer RECORD;
  v_slug TEXT := c_slug;
  v_target UUID;
  v_target_status TEXT;
  v_rehome UUID;
  v_rehomed INTEGER;
BEGIN
  SELECT id, cluster_id, category_id, title, images
  INTO v_offer
  FROM rate.products
  WHERE id = c_offer
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'DOS/Rate#594: offer % not present; nothing to move', c_offer;
    RETURN;
  END IF;

  IF v_offer.title !~* 'iphone\s*16\s*e([^a-z0-9]|$)' THEN
    RAISE EXCEPTION 'DOS/Rate#594: offer % is not an iPhone 16e listing (title %)',
      c_offer, v_offer.title;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM rate.master_products
    WHERE id = c_iphone_16 AND model_key = 'apple:iphone-16:128gb'
  ) THEN
    RAISE EXCEPTION 'DOS/Rate#594: master % is not apple:iphone-16:128gb', c_iphone_16;
  END IF;

  -- The importer's slug fallback when the slug is taken by another model_key.
  IF EXISTS (
    SELECT 1 FROM rate.master_products
    WHERE slug = c_slug AND model_key <> c_model_key
  ) THEN
    v_slug := c_slug || '-' || left(encode(sha256(convert_to(c_model_key, 'UTF8')), 'hex'), 8);
  END IF;

  -- Specs come only from the importer's benchmark registry entry for
  -- apple:iphone-16e (apps/importer/src/shopee/product-normalizer.ts), so the
  -- master is published as the importer seeds benchmark-backed products.
  INSERT INTO rate.master_products (
    category_id, brand, model, variant_name, model_key, name, slug, description,
    ram_gb, storage_gb, screen_size_inch, battery_mah, has_5g,
    specifications, key_specs, images, thumbnail, colors, status
  )
  VALUES (
    v_offer.category_id,
    'Apple',
    'iPhone 16e',
    '128GB',
    c_model_key,
    'Apple iPhone 16e 128GB',
    v_slug,
    '',
    8,
    128,
    6.1,
    4005,
    true,
    jsonb_build_object(
      'category_slug', 'smartphones',
      'availability', jsonb_build_object('announced', 'February 2025'),
      'design', jsonb_build_object(
        'dimensions', '146.7 x 71.5 x 7.8 mm',
        'weight_g', 167,
        'resistance', 'IP68 (6m up to 30 mins)'
      ),
      'display', jsonb_build_object(
        'size_inch', 6.1,
        'type', 'Super Retina XDR OLED, HDR10, Dolby Vision, 1200 nits (peak)',
        'resolution', '1170 x 2532 pixels (~460 ppi)',
        'refresh_rate_hz', 60
      ),
      'hardware', jsonb_build_object(
        'chipset', 'Apple A18 (3 nm)',
        'cpu', 'Hexa-core (2x4.04 GHz + 4x2.20 GHz)',
        'gpu', 'Apple GPU (4-core graphics)',
        'ram_gb', 8,
        'storage_gb', 128,
        'os', 'iOS 18.3 (upgradable)'
      ),
      'battery', jsonb_build_object('capacity_mah', 4005, 'fast_charging_w', 20),
      'camera', jsonb_build_object(
        'main_camera', '48 MP, f/1.6, 26mm (wide), PDAF, OIS',
        'front_camera', '12 MP, f/1.9, 23mm (wide), PDAF + SL 3D'
      ),
      'cellular', jsonb_build_object('has_5g', true)
    ),
    jsonb_build_object(
      'screen', '6.1" Super Retina XDR OLED',
      'chip', 'Apple A18',
      'camera', '48 MP',
      'battery', '4005 mAh (20W)',
      'storage', '128GB',
      'ram', '8GB'
    ),
    COALESCE(v_offer.images, '{}'::TEXT[]),
    v_offer.images[1],
    '{}'::TEXT[],
    'published'
  )
  ON CONFLICT (model_key) DO NOTHING;

  -- An existing apple:iphone-16e:128gb master keeps its own identity and status.
  SELECT id, status INTO STRICT v_target, v_target_status
  FROM rate.master_products
  WHERE model_key = c_model_key
  FOR UPDATE;

  IF v_offer.cluster_id = v_target THEN
    RAISE NOTICE 'DOS/Rate#594: offer % already on master %', c_offer, v_target;
  ELSIF v_offer.cluster_id IS DISTINCT FROM c_iphone_16 THEN
    RAISE EXCEPTION 'DOS/Rate#594: offer % is on unexpected master %', c_offer, v_offer.cluster_id;
  ELSE
    -- submit_community_review stores a review of a master on its cheapest
    -- crawled listing, which was this offer. Those reviews are about the
    -- iPhone 16: keep them there, on the listing the RPC now picks.
    IF EXISTS (SELECT 1 FROM rate.reviews WHERE product_id = c_offer AND origin = 'community') THEN
      SELECT id INTO v_rehome
      FROM rate.products
      WHERE cluster_id = c_iphone_16
        AND origin = 'crawl'
        AND id <> c_offer
      ORDER BY price_current ASC NULLS LAST, created_at ASC
      LIMIT 1;
      IF v_rehome IS NULL THEN
        RAISE EXCEPTION 'DOS/Rate#594: community reviews on offer % have no other iPhone 16 listing', c_offer;
      END IF;
      UPDATE rate.reviews
      SET product_id = v_rehome
      WHERE product_id = c_offer AND origin = 'community';
      GET DIAGNOSTICS v_rehomed = ROW_COUNT;
      RAISE NOTICE 'DOS/Rate#594: kept % community review(s) on iPhone 16 listing %', v_rehomed, v_rehome;
    END IF;

    UPDATE rate.products
    SET cluster_id = v_target,
        updated_at = now()
    WHERE id = c_offer;
    RAISE NOTICE 'DOS/Rate#594: moved offer % from % to % (status %)',
      c_offer, c_iphone_16, v_target, v_target_status;
  END IF;

  PERFORM rate.refresh_master_market_stats(c_iphone_16);
  PERFORM rate.refresh_master_market_stats(v_target);
  PERFORM rate.refresh_master_product_rating(c_iphone_16);
  PERFORM rate.refresh_master_product_rating(v_target);
END $$;
