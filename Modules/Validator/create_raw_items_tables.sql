-- Create minimal raw_items and raw_item_errors tables for Validator Worker
CREATE TABLE IF NOT EXISTS raw_items (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20),
    bank_account VARCHAR(32),
    email VARCHAR(255),
    name VARCHAR(255),
    validation_state VARCHAR(32) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_item_errors (
    id SERIAL PRIMARY KEY,
    raw_item_id INTEGER,
    error_type VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW()
);
