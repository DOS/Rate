-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Change id column to UUID with default gen_random_uuid()
ALTER TABLE raw_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE raw_items ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE raw_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
