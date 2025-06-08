import asyncio
import psycopg
import os
import json

# Fix for Windows psycopg async compatibility
if os.name == 'nt':  # Windows
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

POSTGRES_DSN = 'postgresql://JOY:***REMOVED-SECRET***@localhost:5432/validator'
BATCH_SIZE = 10  # Nhỏ hơn để test

async def validate_item(data):
    """Simple validation logic for MVP"""
    errors = []
    
    # Kiểm tra required fields
    if not data.get('phone'):
        errors.append({'error_code': 100, 'field': 'phone'})  # MISSING_PHONE
    elif len(data.get('phone', '')) < 10:
        errors.append({'error_code': 101, 'field': 'phone'})  # INVALID_PHONE
    
    if not data.get('bank_account'):
        errors.append({'error_code': 200, 'field': 'bank_account'})  # MISSING_BANK_ACCOUNT
    elif len(data.get('bank_account', '')) < 8:
        errors.append({'error_code': 201, 'field': 'bank_account'})  # INVALID_BANK_ACCOUNT
    
    return errors

async def main():
    print("Starting Simple Validator Worker...")
    print(f"PostgreSQL: {POSTGRES_DSN.split('@')[0]}@***")
    print(f"Batch: {BATCH_SIZE}")
    
    try:
        print("Connecting to PostgreSQL...")
        conn = await psycopg.AsyncConnection.connect(POSTGRES_DSN)
        print("Connected to PostgreSQL successfully!")
        
        processed_count = 0
        
        # Chỉ chạy 1 batch để test
        print("Fetching pending items...")
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT id, data FROM raw_items 
                WHERE validation_state = 'PENDING' 
                LIMIT %s
                """, (BATCH_SIZE,)
            )
            items = await cur.fetchall()
        
        if not items:
            print("No pending items found")
            return
            
        print(f"Processing {len(items)} items...")
        
        # Process each item
        for item_id, data_json in items:
            try:
                data = json.loads(data_json) if isinstance(data_json, str) else data_json
                errors = await validate_item(data)
                
                async with conn.cursor() as cur:
                    # Insert errors if any
                    if errors:
                        for err in errors:
                            await cur.execute(
                                """
                                INSERT INTO raw_item_errors (item_id, error_code, field)
                                VALUES (%s, %s, %s)
                                """, (item_id, err['error_code'], err['field'])
                            )
                    
                    # Update validation state
                    new_state = 'ERROR' if errors else 'DONE'
                    await cur.execute(
                        """
                        UPDATE raw_items SET validation_state = %s, updated_at = NOW()
                        WHERE id = %s
                        """, (new_state, item_id)
                    )
                
                processed_count += 1
                print(f"Processed item {item_id}: {new_state}")
                
            except Exception as e:
                print(f"Error processing item {item_id}: {e}")
                # Mark as error
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        UPDATE raw_items SET validation_state = 'ERROR', updated_at = NOW()
                        WHERE id = %s
                        """, (item_id,)
                    )
        
        await conn.commit()
        print(f"Batch completed. Total processed: {processed_count}")
        
        await conn.close()
        print("Connection closed")
        
    except Exception as e:
        print(f"Fatal error: {e}")
        return

if __name__ == "__main__":
    asyncio.run(main())
