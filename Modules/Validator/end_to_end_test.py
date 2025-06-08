#!/usr/bin/env python3
"""
End-to-End Integration Test for Rate Validation Pipeline
Tests complete flow: Scrape → Redis Stream → Validation → Database
"""

import asyncio
import json
import time
import os
import redis.asyncio as redis
import asyncpg
from datetime import datetime
from typing import List, Dict, Any

# Configuration - Use environment variables for Docker compatibility
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
POSTGRES_DSN = os.getenv("POSTGRES_DSN", "postgresql://JOY:***REMOVED-SECRET***@localhost:5432/validator")
REDIS_STREAM = "validation_requests"
CONSUMER_GROUP = "validator_workers"

class EndToEndTester:
    def __init__(self):
        self.redis_client = None
        self.db_conn = None
        self.test_results = []
        self.sent_message_ids = []
        
    async def connect(self):
        """Connect to Redis and PostgreSQL"""
        print("[CONNECT] Connecting to services...")
        
        # Connect to Redis
        self.redis_client = redis.from_url(REDIS_URL)
        await self.redis_client.ping()
        print("[OK] Redis connected")
        
        # Connect to PostgreSQL
        self.db_conn = await asyncpg.connect(POSTGRES_DSN)
        print("[OK] PostgreSQL connected")
        
    async def disconnect(self):
        """Disconnect from services"""
        if self.redis_client:
            await self.redis_client.aclose()
        if self.db_conn:
            await self.db_conn.close()
            
    def generate_test_data(self) -> List[Dict[str, Any]]:
        """Generate realistic test data simulating scrape results"""
        return [
            # Valid cases
            {
                "name": "Nguyen Van Nam",
                "phone": "0987654321",
                "bank_account": "12345678901",
                "email": "nam.nguyen@gmail.com",
                "source": "facebook_scrape",
                "scrape_url": "https://facebook.com/profile/123",
                "scrape_timestamp": datetime.now().isoformat(),
                "expected_result": "DONE"
            },
            {
                "name": "Tran Thi Mai",
                "phone": "0123456789",
                "bank_account": "98765432109",
                "email": "mai.tran@yahoo.com",
                "source": "linkedin_scrape",
                "scrape_url": "https://linkedin.com/in/mai-tran",
                "scrape_timestamp": datetime.now().isoformat(),
                "expected_result": "DONE"
            },
            
            # Invalid cases - Phone validation
            {
                "name": "Le Van Duc",
                "phone": "123",  # Too short
                "bank_account": "11111111111",
                "email": "duc.le@hotmail.com",
                "source": "zalo_scrape",
                "scrape_url": "https://zalo.me/duc123",
                "scrape_timestamp": datetime.now().isoformat(),
                "expected_result": "ERROR"
            },
            {
                "name": "Pham Thi Lan",
                "phone": "",  # Empty
                "bank_account": "22222222222",
                "email": "lan.pham@gmail.com",
                "source": "instagram_scrape",
                "scrape_url": "https://instagram.com/lan_pham",
                "scrape_timestamp": datetime.now().isoformat(),
                "expected_result": "ERROR"
            },
            
            # Invalid cases - Bank account validation
            {
                "name": "Hoang Van Minh",
                "phone": "0909123456",
                "bank_account": "123",  # Too short
                "email": "minh.hoang@outlook.com",
                "source": "tiktok_scrape",
                "scrape_url": "https://tiktok.com/@minh_hoang",
                "scrape_timestamp": datetime.now().isoformat(),
                "expected_result": "ERROR"
            },
            
            # Edge cases
            {
                "name": "",  # Empty name
                "phone": "0888777666",
                "bank_account": "33333333333",
                "email": "test@example.com",
                "source": "twitter_scrape",
                "scrape_url": "https://twitter.com/user123",
                "scrape_timestamp": datetime.now().isoformat(),
                "expected_result": "ERROR"
            }
        ]
        
    async def simulate_scrape_layer(self, test_data: List[Dict[str, Any]]) -> List[str]:
        """
        Layer 1: Simulate scraper sending data to Redis Stream
        Returns list of message IDs
        """
        print("\n[LAYER 1] Simulating Scrape -> Redis Stream")
        message_ids = []
        
        for i, data in enumerate(test_data, 1):
            # Simulate scraper adding metadata
            message_data = {
                "data": json.dumps({
                    "name": data["name"],
                    "phone": data["phone"], 
                    "bank_account": data["bank_account"],
                    "email": data["email"]
                }),
                "source": data["source"],
                "timestamp": data["scrape_timestamp"],
                "scrape_url": data["scrape_url"],
                "batch_id": f"e2e_test_{int(time.time())}",
                "sequence": i
            }
            
            # Send to Redis Stream
            message_id = await self.redis_client.xadd(REDIS_STREAM, message_data)
            message_ids.append(message_id)
            self.sent_message_ids.append(message_id)
            
            print(f"   [SENT] {i}/{len(test_data)}: {data['name']} -> {message_id}")
            
        print(f"[OK] Scrape layer complete: {len(message_ids)} messages sent")
        return message_ids
        
    async def wait_for_validation_layer(self, message_ids: List[str], timeout: int = 30):
        """
        Layer 2: Wait for Redis Stream Validator Worker to process messages
        """
        print(f"\n[LAYER 2] Waiting for Validator Worker (timeout: {timeout}s)")
        
        start_time = time.time()
        processed_count = 0
        
        while time.time() - start_time < timeout:
            # Check consumer group info
            try:
                group_info = await self.redis_client.xinfo_groups(REDIS_STREAM)
                if group_info:
                    pending = group_info[0].get('pending', 0)
                    entries_read = group_info[0].get('entries-read', 0)
                    
                    print(f"   [STATUS] Entries read: {entries_read}, Pending: {pending}")
                    
                    if pending == 0 and entries_read >= len(message_ids):
                        print("[OK] All messages processed by validator")
                        break
                        
            except Exception as e:
                print(f"   [WARN] Error checking stream: {e}")
                
            await asyncio.sleep(2)
        else:
            print("[WARN] Timeout waiting for validation layer")
            
    async def verify_database_layer(self, test_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Layer 3: Verify data in PostgreSQL database
        """
        print("\n[LAYER 3] Verifying Database Layer")
        
        # Wait a bit for final database writes
        await asyncio.sleep(2)
        
        # Get recent test data from database
        recent_items = await self.db_conn.fetch("""
            SELECT 
                id,
                data->>'name' as name,
                data->>'phone' as phone, 
                data->>'bank_account' as bank_account,
                data->>'email' as email,
                validation_state,
                source,
                stream_id,
                created_at
            FROM raw_items 
            WHERE stream_id = ANY($1)
            ORDER BY created_at DESC
        """, [entry_id.decode() for entry_id in self.sent_message_ids])
        
        print(f"   [FOUND] {len(recent_items)} recent items in database")
        
        # Verify results
        results = {
            "total_processed": len(recent_items),
            "valid_count": 0,
            "error_count": 0,
            "matches": 0,
            "mismatches": [],
            "items": []
        }
        
        for item in recent_items:
            item_info = {
                "id": str(item['id']),
                "name": item['name'],
                "phone": item['phone'],
                "validation_state": item['validation_state'],
                "source": item['source'],
                "stream_id": item['stream_id']
            }
            results["items"].append(item_info)
            
            if item['validation_state'] == 'DONE':
                results["valid_count"] += 1
            elif item['validation_state'] == 'ERROR':
                results["error_count"] += 1
                
            # Try to match with expected results
            for test_item in test_data:
                if (test_item['name'] == item['name'] and 
                    test_item['phone'] == item['phone']):
                    if test_item['expected_result'] == item['validation_state']:
                        results["matches"] += 1
                        print(f"   [MATCH] {item['name']} -> {item['validation_state']}")
                    else:
                        results["mismatches"].append({
                            "name": item['name'],
                            "expected": test_item['expected_result'],
                            "actual": item['validation_state']
                        })
                        print(f"   [MISMATCH] {item['name']} expected {test_item['expected_result']}, got {item['validation_state']}")
                    break
                    
        return results
        
    async def check_error_details(self):
        """Check validation error details"""
        print("\n[ERROR CHECK] Checking Error Details...")
        
        errors = await self.db_conn.fetch("""
            SELECT 
                ri.data->>'name' as name,
                ri.data->>'phone' as phone,
                rie.error_code,
                rie.field,
                rie.message
            FROM raw_items ri
            JOIN raw_item_errors rie ON ri.id = rie.item_id
            WHERE ri.created_at > NOW() - INTERVAL '5 minutes'
            ORDER BY ri.created_at DESC
        """)
        
        for error in errors:
            print(f"   [ERROR] {error['name']}: {error['field']} -> {error['message']} (code: {error['error_code']})")
            
        return len(errors)
        
    async def run_full_test(self):
        """Run complete end-to-end test"""
        print("[START] End-to-End Integration Test")
        print("=" * 60)
        
        try:
            await self.connect()
            
            # Generate test data
            test_data = self.generate_test_data()
            print(f"[DATA] Generated {len(test_data)} test cases")
            
            # Layer 1: Scrape simulation
            message_ids = await self.simulate_scrape_layer(test_data)
            
            # Layer 2: Wait for validation
            await self.wait_for_validation_layer(message_ids)
            
            # Layer 3: Verify database
            results = await self.verify_database_layer(test_data)
            
            # Check error details
            error_count = await self.check_error_details()
            
            # Print final results
            print("\n" + "=" * 60)
            print("[RESULTS] END-TO-END TEST RESULTS")
            print("=" * 60)
            print(f"[STATS] Total Messages Sent: {len(test_data)}")
            print(f"[STATS] Database Items Found: {results['total_processed']}")
            print(f"[STATS] Valid Items: {results['valid_count']}")
            print(f"[STATS] Error Items: {results['error_count']}")
            print(f"[STATS] Expected Matches: {results['matches']}/{len(test_data)}")
            print(f"[STATS] Error Details Found: {error_count}")
            
            if results['mismatches']:
                print(f"\n[WARN] Mismatches ({len(results['mismatches'])}):")
                for mismatch in results['mismatches']:
                    print(f"   - {mismatch['name']}: expected {mismatch['expected']}, got {mismatch['actual']}")
                    
            # Success criteria
            success_rate = results['matches'] / len(test_data) if test_data else 0
            if success_rate >= 0.8:  # 80% success rate
                print(f"\n[SUCCESS] TEST PASSED! Success rate: {success_rate:.1%}")
            else:
                print(f"\n[FAIL] TEST FAILED! Success rate: {success_rate:.1%} (minimum: 80%)")
                
        except Exception as e:
            print(f"\n[ERROR] Test failed with error: {e}")
            
        finally:
            await self.disconnect()

async def main():
    """Main test runner"""
    tester = EndToEndTester()
    await tester.run_full_test()

if __name__ == "__main__":
    asyncio.run(main())
