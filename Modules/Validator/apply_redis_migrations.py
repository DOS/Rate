import asyncio
import psycopg
import os

# Fix for Windows psycopg async compatibility
if os.name == 'nt':  # Windows
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Configuration
POSTGRES_DSN = os.getenv('POSTGRES_DSN', 'postgresql://JOY:***REMOVED-SECRET***@localhost:5432/validator')

async def apply_migrations():
    """Apply Redis stream migrations to database"""
    print("Applying Redis Stream Integration migrations...")
    print(f"PostgreSQL: {POSTGRES_DSN.split('@')[0]}@***")
    
    try:
        # Connect to database
        conn = await psycopg.AsyncConnection.connect(POSTGRES_DSN)
        print("Connected to PostgreSQL successfully!")
        
        # Read migration file
        with open('redis_stream_migrations_fixed.sql', 'r', encoding='utf-8') as f:
            migration_sql = f.read()
        
        # Execute migration
        async with conn.cursor() as cur:
            await cur.execute(migration_sql)
        
        await conn.commit()
        print("[SUCCESS] Redis Stream migrations applied successfully!")
        
        # Verify tables were created
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('stream_consumer_stats', 'stream_processing_metrics')
            """)
            
            tables = await cur.fetchall()
            print(f"[SUCCESS] Created tables: {[table[0] for table in tables]}")
            
            # Check if columns were added to raw_items
            await cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'raw_items' 
                AND column_name IN ('stream_id', 'consumer_group', 'consumer_name')
            """)
            
            columns = await cur.fetchall()
            print(f"[SUCCESS] Added columns to raw_items: {[col[0] for col in columns]}")
            
            # Check if functions were created
            await cur.execute("""
                SELECT routine_name 
                FROM information_schema.routines 
                WHERE routine_schema = 'public' 
                AND routine_name IN ('update_consumer_stats', 'record_stream_metric')
            """)
            
            functions = await cur.fetchall()
            print(f"[SUCCESS] Created functions: {[func[0] for func in functions]}")
            
            # Check if views were created
            await cur.execute("""
                SELECT table_name 
                FROM information_schema.views 
                WHERE table_schema = 'public' 
                AND table_name IN ('v_consumer_performance', 'v_recent_stream_activity')
            """)
            
            views = await cur.fetchall()
            print(f"[SUCCESS] Created views: {[view[0] for view in views]}")
        
        await conn.close()
        print("[SUCCESS] Migration verification completed!")
        
    except Exception as e:
        print(f"[ERROR] Migration failed: {e}")
        return False
    
    return True

async def main():
    success = await apply_migrations()
    if success:
        print("\n[READY] Redis Stream Integration is ready!")
        print("Next steps:")
        print("1. Start Redis stream worker: python enhanced_redis_worker.py")
        print("2. Send test messages: python redis_stream_producer.py produce 10")
        print("3. Monitor performance: python redis_stream_monitor.py")
    else:
        print("\n[ERROR] Migration failed. Please check the error messages above.")

if __name__ == "__main__":
    asyncio.run(main())
