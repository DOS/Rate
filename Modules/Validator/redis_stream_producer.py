import asyncio
import redis.asyncio as redis
import json
import os
from datetime import datetime
import random

# Configuration
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
REDIS_STREAM = os.getenv('REDIS_STREAM', 'raw_items')

# Sample test data
SAMPLE_DATA = [
    {
        'phone': '0123456789',
        'bank_account': '12345678901',
        'email': 'test@example.com',
        'name': 'Nguyen Van A',
        'source': 'test_producer'
    },
    {
        'phone': '0987654321',
        'bank_account': '98765432109',
        'email': 'user@domain.com',
        'name': 'Tran Thi B',
        'source': 'test_producer'
    },
    {
        'phone': '0111222333',
        'bank_account': '11122233344',
        'email': 'contact@company.vn',
        'name': 'Le Van C',
        'source': 'test_producer'
    },
    # Invalid data for testing errors
    {
        'phone': '123',  # Too short
        'bank_account': '456',  # Too short
        'email': 'invalid-email',  # Invalid format
        'name': 'Invalid User',
        'source': 'test_producer'
    },
    {
        'phone': '',  # Missing
        'bank_account': '',  # Missing
        'email': '',
        'name': 'Empty User',
        'source': 'test_producer'
    }
]

async def produce_messages(count=10, delay=1):
    """Produce test messages to Redis stream"""
    print(f"Starting Redis Stream Producer...")
    print(f"Redis: {REDIS_URL}")
    print(f"Stream: {REDIS_STREAM}")
    print(f"Messages to send: {count}")
    
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        print("Redis client created")
        
        sent_count = 0
        
        for i in range(count):
            try:
                # Pick random sample data
                data = random.choice(SAMPLE_DATA).copy()
                
                # Add some variation
                data['batch_id'] = f"batch_{i // 5 + 1}"  # Group in batches of 5
                data['sequence'] = i + 1
                
                # Create message
                message = {
                    'data': json.dumps(data),
                    'source': data['source'],
                    'timestamp': datetime.now().isoformat(),
                    'producer': 'test_producer',
                    'batch_id': data['batch_id']
                }
                
                # Send to Redis stream
                message_id = await redis_client.xadd(REDIS_STREAM, message)
                
                sent_count += 1
                print(f"Sent message {sent_count}/{count}: {message_id} - {data.get('name', 'N/A')}")
                
                if delay > 0:
                    await asyncio.sleep(delay)
                    
            except Exception as e:
                print(f"Error sending message {i + 1}: {e}")
        
        print(f"Producer completed. Sent {sent_count} messages to stream '{REDIS_STREAM}'")
        
        # Show stream info
        info = await redis_client.xinfo_stream(REDIS_STREAM)
        print(f"Stream info: {info['length']} messages, first: {info.get('first-entry', 'N/A')}")
        
    except Exception as e:
        print(f"Producer error: {e}")
    finally:
        try:
            await redis_client.close()
        except:
            pass

async def produce_continuous(rate=1):
    """Produce messages continuously at specified rate (messages per second)"""
    print(f"Starting continuous producer at {rate} msg/sec...")
    
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        
        sent_count = 0
        delay = 1.0 / rate if rate > 0 else 1
        
        while True:
            try:
                data = random.choice(SAMPLE_DATA).copy()
                data['sequence'] = sent_count + 1
                data['timestamp'] = datetime.now().isoformat()
                
                message = {
                    'data': json.dumps(data),
                    'source': 'continuous_producer',
                    'timestamp': datetime.now().isoformat(),
                    'producer': 'continuous_producer'
                }
                
                message_id = await redis_client.xadd(REDIS_STREAM, message)
                sent_count += 1
                
                if sent_count % 10 == 0:
                    print(f"Continuous producer: {sent_count} messages sent")
                
                await asyncio.sleep(delay)
                
            except KeyboardInterrupt:
                print(f"\nStopping continuous producer. Sent {sent_count} messages.")
                break
            except Exception as e:
                print(f"Error in continuous producer: {e}")
                await asyncio.sleep(1)
                
    except Exception as e:
        print(f"Continuous producer error: {e}")
    finally:
        try:
            await redis_client.close()
        except:
            pass

async def stream_info():
    """Show Redis stream information"""
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        
        print(f"Redis Stream Info for '{REDIS_STREAM}':")
        print("-" * 50)
        
        try:
            info = await redis_client.xinfo_stream(REDIS_STREAM)
            print(f"Length: {info['length']} messages")
            print(f"First entry: {info.get('first-entry', 'N/A')}")
            print(f"Last entry: {info.get('last-entry', 'N/A')}")
            
            # Consumer groups info
            try:
                groups = await redis_client.xinfo_groups(REDIS_STREAM)
                print(f"\nConsumer Groups: {len(groups)}")
                for group in groups:
                    print(f"  - {group['name']}: {group['consumers']} consumers, {group['pending']} pending")
            except:
                print("\nNo consumer groups found")
                
        except redis.ResponseError:
            print("Stream does not exist")
            
    except Exception as e:
        print(f"Error getting stream info: {e}")
    finally:
        try:
            await redis_client.close()
        except:
            pass

async def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python redis_stream_producer.py produce [count] [delay]")
        print("  python redis_stream_producer.py continuous [rate]")
        print("  python redis_stream_producer.py info")
        return
    
    command = sys.argv[1]
    
    if command == "produce":
        count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        delay = float(sys.argv[3]) if len(sys.argv) > 3 else 1
        await produce_messages(count, delay)
        
    elif command == "continuous":
        rate = float(sys.argv[2]) if len(sys.argv) > 2 else 1
        await produce_continuous(rate)
        
    elif command == "info":
        await stream_info()
        
    else:
        print(f"Unknown command: {command}")

if __name__ == "__main__":
    asyncio.run(main())
