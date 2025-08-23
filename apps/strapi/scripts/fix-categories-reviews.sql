-- Fix Categories table
DO $$
DECLARE
    rec RECORD;
    new_doc_id text;
BEGIN
    FOR rec IN SELECT DISTINCT id, name, locale FROM categories WHERE published_at IS NOT NULL LOOP
        -- Generate new document_id using Strapi format function
        new_doc_id := generate_strapi_document_id();
        
        -- Update the published version with new document_id
        UPDATE categories 
        SET document_id = new_doc_id 
        WHERE id = rec.id;
        
        -- Create a draft version for each published category
        INSERT INTO categories (
            document_id, name, slug, description, is_active, type, 
            contact, review, comment,
            created_at, updated_at, published_at, 
            created_by_id, updated_by_id, locale
        )
        SELECT 
            new_doc_id, name, slug, description, is_active, type,
            contact, review, comment,
            created_at, updated_at, NULL, -- draft version has NULL published_at
            created_by_id, updated_by_id, locale
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
    FOR rec IN SELECT DISTINCT id, title, locale FROM reviews WHERE published_at IS NOT NULL LOOP
        new_doc_id := generate_strapi_document_id();
        
        UPDATE reviews 
        SET document_id = new_doc_id 
        WHERE id = rec.id;
        
        INSERT INTO reviews (
            document_id, title, description, rating, pros, cons,
            is_verified, is_approved, helpful_count, not_helpful_count,
            created_at, updated_at, published_at, 
            created_by_id, updated_by_id, locale
        )
        SELECT 
            new_doc_id, title, description, rating, pros, cons,
            is_verified, is_approved, helpful_count, not_helpful_count,
            created_at, updated_at, NULL,
            created_by_id, updated_by_id, locale
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
FROM reviews
UNION ALL
SELECT 'Directories', COUNT(*),
       SUM(CASE WHEN published_at IS NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN published_at IS NOT NULL THEN 1 ELSE 0 END)
FROM directories;