import asyncio
import redis.asyncio as redis
import psycopg
import os
import json
import uuid
from datetime import datetime
import time

# Fix for Windows psycopg async compatibility
if os.name == 'nt':  # Windows
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Configuration
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
POSTGRES_DSN = os.getenv('POSTGRES_DSN', 'postgresql://JOY:***REMOVED-SECRET***@localhost:5432/validator')
REDIS_STREAM = os.getenv('REDIS_STREAM', 'raw_items')
CONSUMER_GROUP = os.getenv('CONSUMER_GROUP', 'validator_workers')
CONSUMER_NAME = os.getenv('CONSUMER_NAME', f'worker_{uuid.uuid4().hex[:8]}')
BATCH_SIZE = int(os.getenv('BATCH_SIZE', 10))
BLOCK_TIME = int(os.getenv('BLOCK_TIME', 1000))
MAX_RETRIES = int(os.getenv('MAX_RETRIES', 3))

class RedisStreamValidator:
    def __init__(self):
        self.redis_client = None
        self.db_conn = None
        self.processed_count = 0
        self.error_count = 0
        self.start_time = time.time()
        
    async def connect(self):
        """Initialize connections"""
        print(f"[INFO] Connecting to Redis at {REDIS_URL}")
        self.redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        print("[INFO] Redis client created")
        
        print(f"[INFO] Connecting to PostgreSQL at {POSTGRES_DSN}")
        self.db_conn = await psycopg.AsyncConnection.connect(POSTGRES_DSN)
        print("[INFO] Connected to PostgreSQL successfully!")
        
    async def disconnect(self):
        """Close connections"""
        try:
            if self.db_conn:
                await self.db_conn.close()
            if self.redis_client:
                await self.redis_client.close()
            print("Connections closed")
        except Exception as e:
            print(f"Error closing connections: {e}")
    
    async def validate_item(self, data):
        """Enhanced validation logic with detailed error messages"""
        errors = []
        
        # Phone validation
        if not data.get('phone'):
            errors.append({
                'error_code': 100, 
                'field': 'phone', 
                'message': 'Phone number is required'
            })
        elif len(data.get('phone', '')) < 10:
            errors.append({
                'error_code': 101, 
                'field': 'phone', 
                'message': f'Phone number too short: {len(data.get("phone", ""))} chars, minimum 10'
            })
        
        # Bank account validation
        if not data.get('bank_account'):
            errors.append({
                'error_code': 200, 
                'field': 'bank_account', 
                'message': 'Bank account is required'
            })
        elif len(data.get('bank_account', '')) < 8:
            errors.append({
                'error_code': 201, 
                'field': 'bank_account', 
                'message': f'Bank account too short: {len(data.get("bank_account", ""))} chars, minimum 8'
            })
        
        # Email validation (optional but if provided must be valid)
        if data.get('email'):
            email = data.get('email', '')
            if '@' not in email or '.' not in email.split('@')[-1]:
                errors.append({
                    'error_code': 300, 
                    'field': 'email', 
                    'message': f'Invalid email format: {email}'
                })
        
        # Name validation
        if data.get('name') and len(data.get('name', '')) < 2:
            errors.append({
                'error_code': 400, 
                'field': 'name', 
                'message': 'Name must be at least 2 characters'
            })
        
        return errors
    
    async def setup_consumer_group(self):
        """Setup Redis consumer group if it doesn't exist"""
        try:
            await self.redis_client.xgroup_create(REDIS_STREAM, CONSUMER_GROUP, id='0', mkstream=True)
            print(f"Created consumer group '{CONSUMER_GROUP}' for stream '{REDIS_STREAM}'")
        except redis.ResponseError as e:
            if "BUSYGROUP" in str(e):
                print(f"Consumer group '{CONSUMER_GROUP}' already exists")
            else:
                raise e
    
    async def process_stream_message(self, stream_entry):
        """Process a single message from Redis stream with full database integration"""
        stream_id, fields = stream_entry
        processing_start = datetime.now()
        
        try:
            # Parse message data
            data = json.loads(fields.get('data', '{}'))
            source = fields.get('source', 'unknown')
            timestamp = fields.get('timestamp', datetime.now().isoformat())
            
            print(f"Processing {stream_id}: {data.get('name', 'N/A')} - {data.get('phone', 'N/A')}")
            
            # Validate the item
            errors = await self.validate_item(data)
            validation_state = 'ERROR' if errors else 'DONE'
            processing_end = datetime.now()
            
            # Store in database with full stream metadata
            async with self.db_conn.cursor() as cur:
                try:
                    # Insert raw item with stream metadata
                    await cur.execute(
                        """
                        INSERT INTO raw_items (
                            id, data, source, validation_state, 
                            stream_id, consumer_group, consumer_name,
                            processing_started_at, processing_completed_at,
                            created_at, updated_at
                        )
                        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        RETURNING id
                        """, 
                        (
                            json.dumps(data), source, validation_state,
                            stream_id, CONSUMER_GROUP, CONSUMER_NAME,
                            processing_start, processing_end, timestamp
                        )
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
                    
                    # Update consumer stats (skip if function doesn't exist)
                    try:
                        await cur.execute(
                            "SELECT update_consumer_stats(%s, %s, %s, %s, %s)",
                            (CONSUMER_GROUP, CONSUMER_NAME, REDIS_STREAM, stream_id, len(errors) > 0)
                        )
                    except Exception:
                        pass  # Function may not exist, skip
                    
                    # Record processing metrics (skip if function doesn't exist)
                    try:
                        processing_duration = int((processing_end - processing_start).total_seconds() * 1000)
                        await cur.execute(
                            "SELECT record_stream_metric(%s, %s, %s, %s)",
                            (REDIS_STREAM, 'processing_duration_ms', processing_duration, 
                             json.dumps({'consumer': CONSUMER_NAME, 'errors': len(errors)}))
                        )
                    except Exception:
                        pass  # Function may not exist, skip
                    
                    # Commit transaction
                    await self.db_conn.commit()
                    
                except Exception as db_error:
                    # Rollback transaction on error
                    await self.db_conn.rollback()
                    raise db_error
            
            # Acknowledge message in Redis stream
            await self.redis_client.xack(REDIS_STREAM, CONSUMER_GROUP, stream_id)
            
            self.processed_count += 1
            if errors:
                self.error_count += 1
            
            return True, len(errors)
            
        except Exception as e:
            error_msg = f"Error processing stream message {stream_id}: {e}"
            print(error_msg)
            
            # Try to record the error in database with new transaction
            try:
                async with self.db_conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO raw_items (
                            id, data, source, validation_state, 
                            stream_id, consumer_group, consumer_name,
                            processing_started_at, last_error,
                            created_at, updated_at
                        )
                        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        """, 
                        (
                            json.dumps(fields), 'error', 'ERROR',
                            stream_id, CONSUMER_GROUP, CONSUMER_NAME,
                            processing_start, error_msg, datetime.now().isoformat()
                        )
                    )
                await self.db_conn.commit()
            except Exception as db_error:
                print(f"Failed to record error in database: {db_error}")
                # Rollback any pending transaction
                try:
                    await self.db_conn.rollback()
                except Exception:
                    pass
            
            # Don't acknowledge failed messages - they'll be retried
            return False, 0
    
    async def process_pending_messages(self):
        """Process any pending messages that weren't acknowledged"""
        try:
            print(f"[INFO] Checking for pending messages for consumer {CONSUMER_NAME}...")
            pending = await self.redis_client.xpending_range(
                REDIS_STREAM, CONSUMER_GROUP, '-', '+', BATCH_SIZE, CONSUMER_NAME
            )
            print(f"[INFO] xpending_range returned {len(pending) if pending else 0} messages.")
            if pending:
                print(f"[INFO] Found {len(pending)} pending messages to reprocess")
                
                # Claim and process pending messages
                message_ids = [msg['message_id'] for msg in pending]
                claimed = await self.redis_client.xclaim(
                    REDIS_STREAM, CONSUMER_GROUP, CONSUMER_NAME, 
                    min_idle_time=1000,  # 1 second
                    message_ids=message_ids
                )
                print(f"[INFO] Claimed {len(claimed) if claimed else 0} messages for processing.")
                for stream_entry in claimed:
                    await self.process_stream_message(stream_entry)
        except Exception as e:
            print(f"[ERROR] Error processing pending messages: {e}")
    
    async def print_stats(self):
        """Print processing statistics"""
        runtime = time.time() - self.start_time
        rate = self.processed_count / runtime if runtime > 0 else 0
        error_rate = (self.error_count / self.processed_count * 100) if self.processed_count > 0 else 0
        
        print(f"Stats: {self.processed_count} processed, {self.error_count} errors ({error_rate:.1f}%), {rate:.1f} msg/sec")
    
    async def run(self):
        """Main worker loop"""
        print("Starting Enhanced Redis Stream Validator Worker...")
        print(f"Redis: {REDIS_URL}")
        print(f"PostgreSQL: {POSTGRES_DSN.split('@')[0]}@***")
        print(f"Stream: {REDIS_STREAM}")
        print(f"Consumer Group: {CONSUMER_GROUP}")
        print(f"Consumer Name: {CONSUMER_NAME}")
        print(f"Batch Size: {BATCH_SIZE}")
        
        try:
            await self.connect()
            await self.setup_consumer_group()
            await self.process_pending_messages()
            
            print(f"Worker '{CONSUMER_NAME}' ready to process messages...")
            
            while True:
                try:
                    # Read messages from stream
                    messages = await self.redis_client.xreadgroup(
                        CONSUMER_GROUP, CONSUMER_NAME,
                        {REDIS_STREAM: '>'},  # '>' means only new messages
                        count=BATCH_SIZE,
                        block=BLOCK_TIME
                    )
                    
                    if not messages:
                        # No new messages, check for pending ones
                        await self.process_pending_messages()
                        continue
                    
                    # Process messages
                    for stream_name, stream_entries in messages:
                        print(f"Processing {len(stream_entries)} messages from {stream_name}")
                        
                        for stream_entry in stream_entries:
                            await self.process_stream_message(stream_entry)
                        
                        # Print stats every 50 messages
                        if self.processed_count % 50 == 0:
                            await self.print_stats()
                
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
            await self.disconnect()

async def main():
    worker = RedisStreamValidator()
    try:
        await worker.run()
    except KeyboardInterrupt:
        print("\nShutting down worker...")
        await worker.print_stats()
    except Exception as e:
        print(f"Worker failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
