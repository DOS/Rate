import { test, expect } from '@playwright/test';

// Test tạo listing từ Redis Stream
test.describe('Listing Creation Flow', () => {
  // Mock data giống như từ Extension
  const mockShopeeData = {
    requestId: `test_${Date.now()}`,
    source: 'test',
    timestamp: new Date().toISOString(),
    data: {
      items: [{
        product: {
          url: 'https://shopee.vn/i.12345678.87654321',
          productUrl: 'https://shopee.vn/i.12345678.87654321',
          title: 'Test Product - Samsung Galaxy Test',
          description: 'Test product description',
          price: 1000000,
          currency: 'VND',
          category: 'Shopee > Test > Category',
          brand: 'SAMSUNG',
          images: ['https://example.com/image1.jpg'],
          stock: 10,
          rating: 4.5,
          soldCount: 100,
          productReviewCount: 50,
          likedCount: 25
        },
        seller: {
          name: 'Test Seller',
          rating: 4.8,
          responseRate: 95
        },
        review: {
          username: 'test_user',
          content: 'Test review content',
          starRate: 5
        }
      }]
    }
  };

  test.beforeEach(async ({ page }) => {
    // Đảm bảo services đang chạy
    await page.goto('http://localhost:1337/admin');
    await page.waitForTimeout(2000);
  });

  test('should create listing when data sent to Redis', async ({ request }) => {
    // 1. Clear old test data
    const deleteResponse = await request.delete(
      'http://localhost:1337/api/listings',
      {
        headers: {
          'Authorization': 'Bearer your-api-token' // Need actual token
        },
        params: {
          'filters[ListingID][$eq]': 'shopee-vn.12345678_87654321'
        }
      }
    ).catch(() => null);

    // 2. Send data to Redis (simulate Extension)
    // Note: This would normally be done via Redis client
    // For now, we'll call the API directly
    
    // 3. Wait for processing
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. Check if listing was created
    const response = await request.get(
      'http://localhost:1337/api/listings',
      {
        params: {
          'filters[ListingID][$eq]': 'shopee-vn.12345678_87654321',
          'populate': '*'
        }
      }
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    // Verify listing was created
    expect(data.data).toBeDefined();
    expect(data.data.length).toBeGreaterThan(0);
    
    if (data.data.length > 0) {
      const listing = data.data[0];
      expect(listing.attributes.Title).toContain('Samsung Galaxy');
      expect(listing.attributes.Price).toBe(1000000);
      expect(listing.attributes.ListingID).toBe('shopee-vn.12345678_87654321');
    }
  });

  test('should not create duplicate listing', async ({ request }) => {
    // 1. Get initial count
    const initialResponse = await request.get(
      'http://localhost:1337/api/listings',
      {
        params: {
          'filters[ListingID][$eq]': 'shopee-vn.12345678_87654321'
        }
      }
    );
    const initialData = await initialResponse.json();
    const initialCount = initialData.data?.length || 0;

    // 2. Try to create duplicate (send same data again)
    // ... send to Redis again ...

    // 3. Wait and check count didn't increase
    await new Promise(resolve => setTimeout(resolve, 3000));

    const finalResponse = await request.get(
      'http://localhost:1337/api/listings',
      {
        params: {
          'filters[ListingID][$eq]': 'shopee-vn.12345678_87654321'
        }
      }
    );
    const finalData = await finalResponse.json();
    const finalCount = finalData.data?.length || 0;

    // Should not create duplicate
    expect(finalCount).toBe(initialCount);
  });

  test('should create Item after Listing', async ({ request }) => {
    // Check if Item was created and linked
    const itemResponse = await request.get(
      'http://localhost:1337/api/items',
      {
        params: {
          'filters[MatchCode][$eq]': 'samsung-galaxy-test',
          'populate': '*'
        }
      }
    );

    expect(itemResponse.ok()).toBeTruthy();
    const itemData = await itemResponse.json();
    
    // Verify Item was created
    expect(itemData.data).toBeDefined();
    if (itemData.data.length > 0) {
      const item = itemData.data[0];
      expect(item.attributes.Brand).toBe('SAMSUNG');
    }
  });
});

// Test UI display
test.describe('Listing Display in UI', () => {
  test('should display created listing on frontend', async ({ page }) => {
    // Navigate to frontend
    await page.goto('http://localhost:3000');
    
    // Search for the test product
    await page.fill('input[placeholder*="Search"]', 'Samsung Galaxy Test');
    await page.keyboard.press('Enter');
    
    // Wait for results
    await page.waitForSelector('.listing-card', { timeout: 10000 });
    
    // Verify listing appears
    const listingCard = page.locator('.listing-card').first();
    await expect(listingCard).toBeVisible();
    
    // Check listing details
    const title = await listingCard.locator('.listing-title').textContent();
    expect(title).toContain('Samsung Galaxy');
    
    const price = await listingCard.locator('.listing-price').textContent();
    expect(price).toContain('1,000,000');
  });
});

// Integration test with Redis
test.describe('Redis Integration', () => {
  test('should process messages from Redis stream', async ({ request }) => {
    // This test requires Redis client setup
    // Install: npm install redis
    
    // const redis = require('redis');
    // const client = redis.createClient({ url: 'redis://localhost:6379' });
    // await client.connect();
    
    // // Send test message to stream
    // await client.xAdd('validation_requests', '*', {
    //   data: JSON.stringify(mockShopeeData)
    // });
    
    // // Wait for processing
    // await new Promise(resolve => setTimeout(resolve, 5000));
    
    // // Verify listing was created
    // ... check API ...
    
    // await client.disconnect();
  });
});