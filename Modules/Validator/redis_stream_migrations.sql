-- Redis Stream Integration Migrations
-- Add support for stream processing metadata

-- Add new columns to raw_items table for stream processing
ALTER TABLE raw_items 
ADD COLUMN IF NOT EXISTS stream_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS consumer_group VARCHAR(100),
ADD COLUMN IF NOT EXISTS consumer_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Add index for stream processing queries
CREATE INDEX IF NOT EXISTS idx_raw_items_stream_id ON raw_items(stream_id);
CREATE INDEX IF NOT EXISTS idx_raw_items_consumer ON raw_items(consumer_group, consumer_name);
CREATE INDEX IF NOT EXISTS idx_raw_items_processing ON raw_items(validation_state, processing_started_at);

-- Add message column to raw_item_errors for better error tracking
ALTER TABLE raw_item_errors 
ADD COLUMN IF NOT EXISTS message TEXT;

-- Create table for tracking Redis stream consumer performance
CREATE TABLE IF NOT EXISTS stream_consumer_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_group VARCHAR(100) NOT NULL,
    consumer_name VARCHAR(100) NOT NULL,
    stream_name VARCHAR(100) NOT NULL,
    messages_processed INTEGER DEFAULT 0,
    messages_with_errors INTEGER DEFAULT 0,
    last_message_id VARCHAR(255),
    last_processed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(consumer_group, consumer_name, stream_name)
);

-- Create index for consumer stats
CREATE INDEX IF NOT EXISTS idx_stream_consumer_stats_lookup 
ON stream_consumer_stats(consumer_group, consumer_name, stream_name);

-- Create table for tracking stream processing metrics
CREATE TABLE IF NOT EXISTS stream_processing_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_name VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value BIGINT NOT NULL,
    metric_timestamp TIMESTAMP DEFAULT NOW(),
    tags JSONB
);

-- Create index for metrics queries
CREATE INDEX IF NOT EXISTS idx_stream_metrics_lookup 
ON stream_processing_metrics(stream_name, metric_name, metric_timestamp);

-- Create function to update consumer stats
CREATE OR REPLACE FUNCTION update_consumer_stats(
    p_consumer_group VARCHAR(100),
    p_consumer_name VARCHAR(100), 
    p_stream_name VARCHAR(100),
    p_message_id VARCHAR(255),
    p_has_errors BOOLEAN DEFAULT FALSE
) RETURNS VOID AS $$
BEGIN
    INSERT INTO stream_consumer_stats (
        consumer_group, consumer_name, stream_name, 
        messages_processed, messages_with_errors, 
        last_message_id, last_processed_at, updated_at
    ) VALUES (
        p_consumer_group, p_consumer_name, p_stream_name,
        1, CASE WHEN p_has_errors THEN 1 ELSE 0 END,
        p_message_id, NOW(), NOW()
    )
    ON CONFLICT (consumer_group, consumer_name, stream_name) 
    DO UPDATE SET
        messages_processed = stream_consumer_stats.messages_processed + 1,
        messages_with_errors = stream_consumer_stats.messages_with_errors + 
            CASE WHEN p_has_errors THEN 1 ELSE 0 END,
        last_message_id = p_message_id,
        last_processed_at = NOW(),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Create function to record processing metrics
CREATE OR REPLACE FUNCTION record_stream_metric(
    p_stream_name VARCHAR(100),
    p_metric_name VARCHAR(100),
    p_metric_value BIGINT,
    p_tags JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
BEGIN
    INSERT INTO stream_processing_metrics (stream_name, metric_name, metric_value, tags)
    VALUES (p_stream_name, p_metric_name, p_metric_value, p_tags);
END;
$$ LANGUAGE plpgsql;

-- Create view for consumer performance monitoring
CREATE OR REPLACE VIEW v_consumer_performance AS
SELECT 
    scs.consumer_group,
    scs.consumer_name,
    scs.stream_name,
    scs.messages_processed,
    scs.messages_with_errors,
    ROUND(
        CASE 
            WHEN scs.messages_processed > 0 
            THEN (scs.messages_with_errors::DECIMAL / scs.messages_processed) * 100 
            ELSE 0 
        END, 2
    ) as error_rate_percent,
    scs.last_message_id,
    scs.last_processed_at,
    EXTRACT(EPOCH FROM (NOW() - scs.last_processed_at)) as seconds_since_last_message,
    scs.created_at,
    scs.updated_at
FROM stream_consumer_stats scs
ORDER BY scs.last_processed_at DESC;

-- Create view for recent stream processing activity
CREATE OR REPLACE VIEW v_recent_stream_activity AS
SELECT 
    ri.id,
    ri.stream_id,
    ri.consumer_group,
    ri.consumer_name,
    ri.source,
    ri.validation_state,
    ri.processing_started_at,
    ri.processing_completed_at,
    EXTRACT(EPOCH FROM (ri.processing_completed_at - ri.processing_started_at)) as processing_duration_seconds,
    ri.retry_count,
    ri.last_error,
    COUNT(rie.id) as error_count,
    ri.created_at,
    ri.updated_at
FROM raw_items ri
LEFT JOIN raw_item_errors rie ON ri.id = rie.item_id
WHERE ri.stream_id IS NOT NULL
GROUP BY ri.id, ri.stream_id, ri.consumer_group, ri.consumer_name, ri.source, 
         ri.validation_state, ri.processing_started_at, ri.processing_completed_at,
         ri.retry_count, ri.last_error, ri.created_at, ri.updated_at
ORDER BY ri.updated_at DESC
LIMIT 1000;

-- Insert initial metrics
INSERT INTO stream_processing_metrics (stream_name, metric_name, metric_value, tags)
VALUES 
    ('raw_items', 'migration_completed', 1, '{"version": "1.0", "type": "redis_stream_integration"}'),
    ('raw_items', 'schema_version', 1, '{"migration_date": "' || NOW()::text || '"}');

-- Show migration summary
DO $$
BEGIN
    RAISE NOTICE 'Redis Stream Integration Migration Completed';
    RAISE NOTICE 'Added columns: stream_id, consumer_group, consumer_name, processing timestamps';
    RAISE NOTICE 'Created tables: stream_consumer_stats, stream_processing_metrics';
    RAISE NOTICE 'Created functions: update_consumer_stats, record_stream_metric';
    RAISE NOTICE 'Created views: v_consumer_performance, v_recent_stream_activity';
END $$;
