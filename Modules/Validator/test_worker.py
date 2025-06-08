import asyncio
import psycopg
import os
import json

# Fix for Windows psycopg async compatibility
if os.name == 'nt':  # Windows
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

POSTGRES_DSN = 'postgresql://JOY:***REMOVED-SECRET***@localhost:5432/validator'

async def test_connection():
    print("Testing async PostgreSQL connection...")
    try:
        conn = await psycopg.AsyncConnection.connect(POSTGRES_DSN)
        print("Connected successfully!")
        
        async with conn.cursor() as cur:
            await cur.execute("SELECT COUNT(*) FROM raw_items WHERE validation_state = 'PENDING'")
            result = await cur.fetchone()
            print(f"Pending items: {result[0]}")
            
        await conn.close()
        print("Connection closed")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())
