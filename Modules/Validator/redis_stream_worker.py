import asyncio
import redis.asyncio as redis
import psycopg
import os
import json
import uuid
from datetime import datetime

# Fix for Windows psycopg async compatibility
if os.name == 'nt':  # Windows
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Configuration
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
POSTGRES_DSN = os.getenv('POSTGRES_DSN', 'postgresql://JOY:***REMOVED-SECRET***@localhost:5432/validator')
REDIS_STREAM = os.getenv('REDIS_STREAM', 'raw_items')
CONSUMER_GROUP = os.getenv('CONSUMER_GROUP', 'validator_workers')
CONSUMER_NAME = os.getenv('CONSUMER_NAME', f'worker_{uuid.uuid4().hex[:8]}')
BATCH_SIZE = int(os.getenv('BATCH_SIZE', 10))  # Smaller batch for real-time processing
BLOCK_TIME = int(os.getenv('BLOCK_TIME', 1000))  # 1 second block time

async def validate_item(data):
    """Enhanced validation logic for Redis stream processing"""
    errors = []
    
    # Kiểm tra required fields
    if not data.get('phone'):
        errors.append({'error_code': 100, 'field': 'phone', 'message': 'Missing phone number'})
    elif len(data.get('phone', '')) < 10:
        errors.append({'error_code': 101, 'field': 'phone', 'message': 'Invalid phone number format'})
    
    if not data.get('bank_account'):
        errors.append({'error_code': 200, 'field': 'bank_account', 'message': 'Missing bank account'})
    elif len(data.get('bank_account', '')) < 8:
        errors.append({'error_code': 201, 'field': 'bank_account', 'message': 'Invalid bank account format'})
    
    # Additional validation rules
    if data.get('email') and '@' not in data.get('email', ''):
        errors.append({'error_code': 300, 'field': 'email', 'message': 'Invalid email format'})
    
    return errors

async def process_stream_message(redis_client, conn, stream_entry):
    """Process a single message from Redis stream"""
    stream_id, fields = stream_entry
    
    try:
        # Parse message data
        data = json.loads(fields.get('data', '{}'))
        source = fields.get('source', 'unknown')
        timestamp = fields.get('timestamp', datetime.now().isoformat())
        
        print(f"Processing stream message {stream_id}: {data.get('phone', 'N/A')}")
        
        # Validate the item
        errors = await validate_item(data)
        
        # Store in database
        async with conn.cursor() as cur:
            # Insert raw item
            await cur.execute(
                """
                INSERT INTO raw_items (id, data, source, validation_state, created_at, updated_at)
                VALUES (gen_random_uuid(), %s, %s, %s, %s, NOW())
                RETURNING id
                """, 
                (json.dumps(data), source, 'ERROR' if errors else 'DONE', timestamp)
            )
            
            item_result = await cur.fetchone()
            item_id = item_result[0]
            
            # Insert errors if any
            if errors:
                for err in errors:
                    await cur.execute(
                        """
                        INSERT INTO raw_item_errors (item_id, error_code, field, message)
                        VALUES (%s, %s, %s, %s)
                        """, 
                        (item_id, err['error_code'], err['field'], err.get('message', ''))
                    )
        
        await conn.commit()
        
        # Acknowledge message in Redis stream
        await redis_client.xack(REDIS_STREAM, CONSUMER_GROUP, stream_id)
        
        return True, len(errors)
        
    except Exception as e:
        print(f"Error processing stream message {stream_id}: {e}")
        # Don't acknowledge failed messages - they'll be retried
        return False, 0

async def setup_consumer_group(redis_client):
    """Setup Redis consumer group if it doesn't exist"""
    try:
        await redis_client.xgroup_create(REDIS_STREAM, CONSUMER_GROUP, id='0', mkstream=True)
        print(f"Created consumer group '{CONSUMER_GROUP}' for stream '{REDIS_STREAM}'")
    except redis.ResponseError as e:
        if "BUSYGROUP" in str(e):
            print(f"Consumer group '{CONSUMER_GROUP}' already exists")
        else:
            raise e

async def process_pending_messages(redis_client, conn):
    """Process any pending messages that weren't acknowledged"""
    try:
        # Get pending messages for this consumer
        pending = await redis_client.xpending_range(
            REDIS_STREAM, CONSUMER_GROUP, '-', '+', BATCH_SIZE, CONSUMER_NAME
        )
        
        if pending:
            print(f"Found {len(pending)} pending messages to reprocess")
            
            # Claim and process pending messages
            message_ids = [msg['message_id'] for msg in pending]
            claimed = await redis_client.xclaim(
                REDIS_STREAM, CONSUMER_GROUP, CONSUMER_NAME, 
                min_idle_time=60000,  # 1 minute
                message_ids=message_ids
            )
            
            for stream_entry in claimed:
                await process_stream_message(redis_client, conn, stream_entry)
                
    except Exception as e:
        print(f"Error processing pending messages: {e}")

async def main():
    print("Starting Redis Stream Validator Worker...")
    print(f"Redis: {REDIS_URL}")
    print(f"PostgreSQL: {POSTGRES_DSN.split('@')[0]}@***")
    print(f"Stream: {REDIS_STREAM}")
    print(f"Consumer Group: {CONSUMER_GROUP}")
    print(f"Consumer Name: {CONSUMER_NAME}")
    print(f"Batch Size: {BATCH_SIZE}")
    
    try:
        # Connect to Redis
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        print("Redis client created")
        
        # Connect to PostgreSQL
        print("Connecting to PostgreSQL...")
        conn = await psycopg.AsyncConnection.connect(POSTGRES_DSN)
        print("Connected to PostgreSQL successfully!")
        
        # Setup consumer group
        await setup_consumer_group(redis_client)
        
        # Process any pending messages first
        await process_pending_messages(redis_client, conn)
        
        processed_count = 0
        error_count = 0
        
        print(f"Worker '{CONSUMER_NAME}' ready to process messages...")
        
        while True:
            try:
                # Read messages from stream
                messages = await redis_client.xreadgroup(
                    CONSUMER_GROUP, CONSUMER_NAME,
                    {REDIS_STREAM: '>'},  # '>' means only new messages
                    count=BATCH_SIZE,
                    block=BLOCK_TIME
                )
                
                if not messages:
                    # No new messages, check for pending ones
                    await process_pending_messages(redis_client, conn)
                    continue
                
                # Process messages
                for stream_name, stream_entries in messages:
                    print(f"Processing {len(stream_entries)} messages from {stream_name}")
                    
                    for stream_entry in stream_entries:
                        success, errors = await process_stream_message(redis_client, conn, stream_entry)
                        
                        if success:
                            processed_count += 1
                            if errors > 0:
                                error_count += 1
                        
                        # Log progress every 100 items
                        if processed_count % 100 == 0:
                            print(f"Progress: {processed_count} processed, {error_count} with errors")
                
            except redis.ConnectionError as e:
                print(f"Redis connection error: {e}")
                await asyncio.sleep(5)
                
            except Exception as e:
                print(f"Worker error: {e}")
                await asyncio.sleep(2)
                
    except Exception as e:
        print(f"Fatal error: {e}")
        return
    finally:
        try:
            await conn.close()
            await redis_client.close()
            print("Connections closed")
        except:
            pass

if __name__ == "__main__":
    asyncio.run(main())
