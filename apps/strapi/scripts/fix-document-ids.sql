-- Script to fix document_id format for Strapi 5
-- Strapi 5 uses cuid2/nanoid format (lowercase alphanumeric, 25 chars)

-- Function to generate Strapi 5 compatible document_id
CREATE OR REPLACE FUNCTION generate_strapi_document_id() RETURNS text AS $$
DECLARE
    chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
    result text := '';
    i integer;
BEGIN
    -- Generate 25 character ID similar to Strapi 5 format
    FOR i IN 1..25 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Backup existing data first
CREATE TABLE IF NOT EXISTS items_backup_20250823 AS SELECT * FROM items;
CREATE TABLE IF NOT EXISTS categories_backup_20250823 AS SELECT * FROM categories;
CREATE TABLE IF NOT EXISTS reviews_backup_20250823 AS SELECT * FROM reviews;

-- Fix Items table - create proper document structure
DO $$
DECLARE
    rec RECORD;
    new_doc_id text;
BEGIN
    FOR rec IN SELECT DISTINCT id, title, locale FROM items WHERE published_at IS NOT NULL LOOP
        -- Generate new document_id for this item
        new_doc_id := generate_strapi_document_id();
        
        -- Update the published version with new document_id
        UPDATE items 
        SET document_id = new_doc_id 
        WHERE id = rec.id;
        
        -- Create a draft version for each published item
        INSERT INTO items (
            document_id, title, slug, description, is_active, is_featured, 
            qr_code, item_type, dynamic_fields, created_at, updated_at, 
            published_at, created_by_id, updated_by_id, locale
        )
        SELECT 
            new_doc_id, title, slug, description, is_active, is_featured,
            qr_code, item_type, dynamic_fields, created_at, updated_at,
            NULL, -- draft version has NULL published_at
            created_by_id, updated_by_id, locale
        FROM items 
        WHERE id = rec.id;
    END LOOP;
END $$;

-- Fix Categories table
DO $$
DECLARE
    rec RECORD;
    new_doc_id text;
BEGIN
    FOR rec IN SELECT DISTINCT id, name, locale FROM categories WHERE published_at IS NOT NULL LOOP
        new_doc_id := generate_strapi_document_id();
        
        UPDATE categories 
        SET document_id = new_doc_id 
        WHERE id = rec.id;
        
        INSERT INTO categories (
            document_id, name, slug, description, icon, parent_category_slug,
            created_at, updated_at, published_at, created_by_id, updated_by_id, locale
        )
        SELECT 
            new_doc_id, name, slug, description, icon, parent_category_slug,
            created_at, updated_at, NULL, created_by_id, updated_by_id, locale
        FROM categories 
        WHERE id = rec.id;
    END LOOP;
END $$;

-- Fix Reviews table
DO $$
DECLARE
    rec RECORD;
    new_doc_id text;
BEGIN
    FOR rec IN SELECT DISTINCT id, rating, locale FROM reviews WHERE published_at IS NOT NULL LOOP
        new_doc_id := generate_strapi_document_id();
        
        UPDATE reviews 
        SET document_id = new_doc_id 
        WHERE id = rec.id;
        
        INSERT INTO reviews (
            document_id, rating, comment, helpful_count, verification_method,
            verified_purchase, response_from_owner, date, anonymous,
            created_at, updated_at, published_at, created_by_id, updated_by_id, locale
        )
        SELECT 
            new_doc_id, rating, comment, helpful_count, verification_method,
            verified_purchase, response_from_owner, date, anonymous,
            created_at, updated_at, NULL, created_by_id, updated_by_id, locale
        FROM reviews 
        WHERE id = rec.id;
    END LOOP;
END $$;

-- Verify the fix
SELECT 'Items' as table_name, COUNT(*) as total, 
       SUM(CASE WHEN published_at IS NULL THEN 1 ELSE 0 END) as drafts,
       SUM(CASE WHEN published_at IS NOT NULL THEN 1 ELSE 0 END) as published
FROM items
UNION ALL
SELECT 'Categories', COUNT(*), 
       SUM(CASE WHEN published_at IS NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN published_at IS NOT NULL THEN 1 ELSE 0 END)
FROM categories
UNION ALL
SELECT 'Reviews', COUNT(*),
       SUM(CASE WHEN published_at IS NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN published_at IS NOT NULL THEN 1 ELSE 0 END)
FROM reviews;