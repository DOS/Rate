import asyncio
import aioredis
import psycopg
import os

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
POSTGRES_DSN = os.getenv('POSTGRES_DSN', 'postgresql://postgres:postgres@localhost:5432/rate')
REDIS_STREAM = os.getenv('REDIS_STREAM', 'raw_items')
BATCH_SIZE = int(os.getenv('BATCH_SIZE', 500))

async def validate_item(item):
    errors = []
    # Dummy validation logic for MVP
    if not item.get('phone'):
        errors.append({'error_code': 100, 'field': 'phone'})
    if not item.get('bank_account'):
        errors.append({'error_code': 100, 'field': 'bank_account'})
    # Add more rules as needed
    return errors

async def main():
    redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    async with psycopg.AsyncConnection.connect(POSTGRES_DSN) as conn:
        while True:
            batch = await redis.xread({REDIS_STREAM: '0-0'}, count=BATCH_SIZE, block=1000)
            if not batch:
                await asyncio.sleep(0.1)
                continue
            for stream_name, entries in batch:
                for entry_id, fields in entries:
                    errors = await validate_item(fields)
                    async with conn.cursor() as cur:
                        if errors:
                            for err in errors:
                                await cur.execute(
                                    """
                                    INSERT INTO raw_item_errors (item_id, error_code, field, occurred_at)
                                    VALUES (%s, %s, %s, NOW())
                                    """, (fields.get('id'), err['error_code'], err['field'])
                                )
                        await cur.execute(
                            """
                            UPDATE raw_items SET validation_state = 'DONE' WHERE id = %s
                            """, (fields.get('id'),)
                        )
            await conn.commit()

if __name__ == '__main__':
    asyncio.run(main())
