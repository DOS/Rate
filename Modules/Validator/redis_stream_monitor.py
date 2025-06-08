import asyncio
import os
import redis.asyncio as redis
import psycopg
from datetime import datetime, timedelta

# Fix for Windows psycopg async compatibility
if os.name == 'nt':  # Windows
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import json
import time

# Configuration
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
POSTGRES_DSN = os.getenv('POSTGRES_DSN', 'postgresql://JOY:***REMOVED-SECRET***@localhost:5432/validator')
REDIS_STREAM = os.getenv('REDIS_STREAM', 'raw_items')

class RedisStreamMonitor:
    def __init__(self):
        self.redis_client = None
        self.db_conn = None
        
    async def connect(self):
        """Initialize connections"""
        self.redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        self.db_conn = await psycopg.AsyncConnection.connect(POSTGRES_DSN)
        print("Connected to Redis and PostgreSQL")
        
    async def disconnect(self):
        """Close connections"""
        try:
            if self.db_conn:
                await self.db_conn.close()
            if self.redis_client:
                await self.redis_client.close()
        except Exception as e:
            print(f"Error closing connections: {e}")
    
    async def get_stream_info(self):
        """Get Redis stream information"""
        try:
            info = await self.redis_client.xinfo_stream(REDIS_STREAM)
            return {
                'length': info['length'],
                'first_entry': info.get('first-entry'),
                'last_entry': info.get('last-entry'),
                'radix_tree_keys': info.get('radix-tree-keys', 0),
                'radix_tree_nodes': info.get('radix-tree-nodes', 0)
            }
        except redis.ResponseError:
            return {'length': 0, 'error': 'Stream does not exist'}
    
    async def get_consumer_groups_info(self):
        """Get consumer groups information"""
        try:
            groups = await self.redis_client.xinfo_groups(REDIS_STREAM)
            group_info = []
            
            for group in groups:
                group_data = {
                    'name': group['name'],
                    'consumers': group['consumers'],
                    'pending': group['pending'],
                    'last_delivered_id': group['last-delivered-id']
                }
                
                # Get consumers in this group
                try:
                    consumers = await self.redis_client.xinfo_consumers(REDIS_STREAM, group['name'])
                    group_data['consumer_details'] = []
                    
                    for consumer in consumers:
                        consumer_data = {
                            'name': consumer['name'],
                            'pending': consumer['pending'],
                            'idle': consumer['idle']
                        }
                        group_data['consumer_details'].append(consumer_data)
                        
                except Exception as e:
                    group_data['consumer_details'] = f"Error: {e}"
                
                group_info.append(group_data)
                
            return group_info
            
        except redis.ResponseError:
            return []
    
    async def get_database_stats(self):
        """Get database processing statistics"""
        try:
            async with self.db_conn.cursor() as cur:
                # Get overall processing stats
                await cur.execute("""
                    SELECT 
                        COUNT(*) as total_items,
                        COUNT(*) FILTER (WHERE validation_state = 'DONE') as done_items,
                        COUNT(*) FILTER (WHERE validation_state = 'ERROR') as error_items,
                        COUNT(*) FILTER (WHERE validation_state = 'PENDING') as pending_items,
                        COUNT(*) FILTER (WHERE stream_id IS NOT NULL) as stream_processed_items
                    FROM raw_items
                """)
                
                stats = await cur.fetchone()
                
                # Get consumer performance
                await cur.execute("""
                    SELECT * FROM v_consumer_performance 
                    ORDER BY last_processed_at DESC
                """)
                
                consumer_stats = await cur.fetchall()
                
                # Get recent activity
                await cur.execute("""
                    SELECT 
                        validation_state,
                        COUNT(*) as count,
                        AVG(processing_duration_seconds) as avg_duration
                    FROM v_recent_stream_activity 
                    WHERE created_at > NOW() - INTERVAL '1 hour'
                    GROUP BY validation_state
                """)
                
                recent_activity = await cur.fetchall()
                
                # Get error summary
                await cur.execute("""
                    SELECT 
                        rie.error_code,
                        rie.field,
                        COUNT(*) as error_count,
                        rie.message
                    FROM raw_item_errors rie
                    JOIN raw_items ri ON rie.item_id = ri.id
                    WHERE ri.created_at > NOW() - INTERVAL '1 hour'
                    GROUP BY rie.error_code, rie.field, rie.message
                    ORDER BY error_count DESC
                    LIMIT 10
                """)
                
                error_summary = await cur.fetchall()
                
                return {
                    'overall_stats': {
                        'total_items': stats[0],
                        'done_items': stats[1],
                        'error_items': stats[2],
                        'pending_items': stats[3],
                        'stream_processed_items': stats[4]
                    },
                    'consumer_stats': [
                        {
                            'consumer_group': row[0],
                            'consumer_name': row[1],
                            'stream_name': row[2],
                            'messages_processed': row[3],
                            'messages_with_errors': row[4],
                            'error_rate_percent': row[5],
                            'last_message_id': row[6],
                            'last_processed_at': row[7],
                            'seconds_since_last_message': row[8]
                        } for row in consumer_stats
                    ],
                    'recent_activity': [
                        {
                            'validation_state': row[0],
                            'count': row[1],
                            'avg_duration': float(row[2]) if row[2] else 0
                        } for row in recent_activity
                    ],
                    'error_summary': [
                        {
                            'error_code': row[0],
                            'field': row[1],
                            'count': row[2],
                            'message': row[3]
                        } for row in error_summary
                    ]
                }
                
        except Exception as e:
            return {'error': str(e)}
    
    async def print_dashboard(self):
        """Print monitoring dashboard"""
        print("\n" + "="*80)
        print(f"REDIS STREAM MONITOR - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*80)
        
        # Redis Stream Info
        stream_info = await self.get_stream_info()
        print(f"\n[STREAM INFO] ({REDIS_STREAM}):")
        print("-" * 40)
        if 'error' in stream_info:
            print(f"[ERROR] {stream_info['error']}")
        else:
            print(f"Messages in stream: {stream_info['length']}")
            if stream_info['length'] > 0:
                print(f"First entry: {stream_info.get('first_entry', 'N/A')}")
                print(f"Last entry: {stream_info.get('last_entry', 'N/A')}")
        
        # Consumer Groups Info
        groups_info = await self.get_consumer_groups_info()
        print(f"\n[CONSUMER GROUPS]:")
        print("-" * 40)
        if not groups_info:
            print("No consumer groups found")
        else:
            for group in groups_info:
                print(f"Group: {group['name']}")
                print(f"  Consumers: {group['consumers']}, Pending: {group['pending']}")
                print(f"  Last delivered: {group['last_delivered_id']}")
                
                if isinstance(group['consumer_details'], list):
                    for consumer in group['consumer_details']:
                        idle_minutes = consumer['idle'] / 60000  # Convert ms to minutes
                        print(f"    - {consumer['name']}: {consumer['pending']} pending, idle {idle_minutes:.1f}m")
                print()
        
        # Database Stats
        db_stats = await self.get_database_stats()
        print(f"[DATABASE PROCESSING STATS]:")
        print("-" * 40)
        if 'error' in db_stats:
            print(f"[ERROR] Database error: {db_stats['error']}")
        else:
            overall = db_stats['overall_stats']
            print(f"Total items: {overall['total_items']}")
            print(f"  [OK] Done: {overall['done_items']}")
            print(f"  [ERROR] Error: {overall['error_items']}")
            print(f"  [PENDING] Pending: {overall['pending_items']}")
            print(f"  [STREAM] Stream processed: {overall['stream_processed_items']}")
            
            # Consumer Performance
            print(f"\n[CONSUMER PERFORMANCE]:")
            print("-" * 40)
            for consumer in db_stats['consumer_stats']:
                print(f"Consumer: {consumer['consumer_name']}")
                print(f"  Processed: {consumer['messages_processed']}")
                print(f"  Error rate: {consumer['error_rate_percent']:.1f}%")
                print(f"  Last active: {consumer['seconds_since_last_message']:.0f}s ago")
                print()
            
            # Recent Activity
            print(f"[RECENT ACTIVITY (1 hour)]:")
            print("-" * 40)
            for activity in db_stats['recent_activity']:
                print(f"{activity['validation_state']}: {activity['count']} items, avg {activity['avg_duration']:.2f}s")
            
            # Error Summary
            if db_stats['error_summary']:
                print(f"\n[ERROR SUMMARY (1 hour)]:")
                print("-" * 40)
                for error in db_stats['error_summary'][:5]:
                    print(f"Code {error['error_code']}: {error['count']} occurrences | Field: {error['field'] or 'N/A'}")
                    print(f"  Message: {error['message']}")
    
    async def monitor_continuous(self, interval=30):
        """Run continuous monitoring"""
        print(f"Starting continuous monitoring (refresh every {interval}s)")
        print("Press Ctrl+C to stop")
        
        try:
            while True:
                await self.print_dashboard()
                await asyncio.sleep(interval)
                
        except KeyboardInterrupt:
            print("\nMonitoring stopped")
    
    async def run_once(self):
        """Run monitoring once"""
        await self.print_dashboard()

async def main():
    import sys
    
    monitor = RedisStreamMonitor()
    
    try:
        await monitor.connect()
        
        if len(sys.argv) > 1 and sys.argv[1] == "continuous":
            interval = int(sys.argv[2]) if len(sys.argv) > 2 else 30
            await monitor.monitor_continuous(interval)
        else:
            await monitor.run_once()
            
    except Exception as e:
        print(f"Monitor error: {e}")
    finally:
        await monitor.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
