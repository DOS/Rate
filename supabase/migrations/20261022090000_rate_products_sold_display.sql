-- Rate (DOS/Rate-Services#201): Shopee often shows only a sold-count label
-- ("20k+") instead of the exact number. The crawler stores the label's floor
-- in historical_sold; this column keeps the label itself so rate.vn can show
-- "20k+" instead of an exact-looking "20.000". NULL means historical_sold is
-- an exact count.
--
-- Idempotent. Table-level grants on rate.products (anon/authenticated SELECT,
-- rate_worker SELECT/INSERT/UPDATE) already cover a new column.

-- Fail fast instead of queueing every reader behind a blocked ALTER.
SELECT pg_catalog.set_config('lock_timeout', '5s', true);

ALTER TABLE rate.products
  ADD COLUMN IF NOT EXISTS historical_sold_display TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rate_products_historical_sold_display_len'
      AND conrelid = 'rate.products'::regclass
  ) THEN
    -- NOT VALID: no table scan under the ALTER's lock; validated below with a
    -- weaker lock (the new column is NULL on every existing row).
    ALTER TABLE rate.products
      ADD CONSTRAINT rate_products_historical_sold_display_len
      CHECK (historical_sold_display IS NULL OR char_length(historical_sold_display) BETWEEN 1 AND 16)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE rate.products VALIDATE CONSTRAINT rate_products_historical_sold_display_len;

COMMENT ON COLUMN rate.products.historical_sold_display IS
  'Marketplace sold-count label (e.g. "20k+") when historical_sold is only its floor; NULL when historical_sold is exact.';
