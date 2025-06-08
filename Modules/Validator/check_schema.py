import asyncio
import psycopg
import os

# Fix for Windows psycopg async compatibility
if os.name == 'nt':  # Windows
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Configuration
POSTGRES_DSN = os.getenv('POSTGRES_DSN', 'postgresql://JOY:***REMOVED-SECRET***@localhost:5432/validator')

async def check_schema():
    """Check current database schema"""
    print("Checking current database schema...")
    
    try:
        conn = await psycopg.AsyncConnection.connect(POSTGRES_DSN)
        print("Connected to PostgreSQL successfully!")
        
        # Check raw_items table structure
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'raw_items' 
                ORDER BY ordinal_position
            """)
            
            columns = await cur.fetchall()
            print("\nraw_items table columns:")
            print("-" * 60)
            for col in columns:
                print(f"  {col[0]:<20} {col[1]:<15} nullable={col[2]:<5} default={col[3] or 'None'}")
            
            # Check raw_item_errors table structure
            await cur.execute("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'raw_item_errors' 
                ORDER BY ordinal_position
            """)
            
            error_columns = await cur.fetchall()
            print("\nraw_item_errors table columns:")
            print("-" * 60)
            for col in error_columns:
                print(f"  {col[0]:<20} {col[1]:<15} nullable={col[2]:<5} default={col[3] or 'None'}")
            
            # Check existing tables
            await cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            """)
            
            tables = await cur.fetchall()
            print(f"\nExisting tables: {[table[0] for table in tables]}")
        
        await conn.close()
        
    except Exception as e:
        print(f"[ERROR] Schema check failed: {e}")

if __name__ == "__main__":
    asyncio.run(check_schema())
