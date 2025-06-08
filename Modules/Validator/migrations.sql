-- Migration: Tạo bảng raw_items và raw_item_errors cho MVP Validator

CREATE EXTENSION IF NOT EXISTS "pg_uuidv7";

CREATE TABLE IF NOT EXISTS raw_items (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    phone TEXT,
    bank_account TEXT,
    data JSONB,
    validation_state TEXT DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_phone ON raw_items(phone);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bank_account ON raw_items(bank_account);

CREATE TABLE IF NOT EXISTS raw_item_errors (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    item_id uuid NOT NULL,
    error_code INT NOT NULL,
    field TEXT,
    occurred_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_item FOREIGN KEY(item_id) REFERENCES raw_items(id)
);

CREATE INDEX IF NOT EXISTS idx_raw_item_errors_item_id ON raw_item_errors(item_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_raw_items_updated_at BEFORE UPDATE ON raw_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
