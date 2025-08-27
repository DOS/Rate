/**
 * Redis Worker Service
 * Background worker để consume và xử lý messages từ Redis Streams
 */

import type { Core } from '@strapi/strapi';
import redisStreamService from './redisStream';
import ListingProcessorService from './listingProcessor';

class RedisWorkerService {
  private isRunning: boolean = false;
  private consumerGroup: string = 'strapi-workers';
  private consumerName: string = `worker-${process.pid}`;
  private strapi: Core.Strapi | null = null;

  /**
   * Start worker để consume validation requests
   */
  async start(strapiInstance?: Core.Strapi) {
    this.strapi = strapiInstance || (global as any).strapi;
    if (this.isRunning) {
      console.log('[RedisWorker] Worker already running');
      return;
    }

    this.isRunning = true;
    console.log('[RedisWorker] Starting worker...');

    // Initialize Redis connection
    await redisStreamService.initialize();

    // Start consuming messages
    this.consumeValidationRequests();
  }

  /**
   * Stop worker
   */
  stop() {
    this.isRunning = false;
    console.log('[RedisWorker] Worker stopped');
  }

  /**
   * Consume validation requests từ Redis Stream
   */
  private async consumeValidationRequests() {
    const client = (redisStreamService as any).client;
    if (!client) {
      console.error('[RedisWorker] Redis client not available');
      return;
    }

    // Create consumer group if not exists
    try {
      await client.xGroupCreate('validation_requests', this.consumerGroup, '0', {
        MKSTREAM: true
      });
      console.log('[RedisWorker] Created consumer group:', this.consumerGroup);
    } catch (error: any) {
      if (error.message?.includes('BUSYGROUP')) {
        console.log('[RedisWorker] Consumer group already exists');
      } else {
        console.error('[RedisWorker] Error creating consumer group:', error);
      }
    }

    console.log('[RedisWorker] Starting to consume validation requests...');

    while (this.isRunning) {
      try {
        // First, try to read pending messages (messages that were not acknowledged)
        let messages = await client.xReadGroup(
          this.consumerGroup,
          this.consumerName,
          [
            {
              key: 'validation_requests',
              id: '0' // Read pending messages first
            }
          ],
          {
            COUNT: 10,
            BLOCK: 0 // Don't block for pending messages
          }
        );

        // If no pending messages, read new messages
        if (!messages || messages.length === 0) {
          messages = await client.xReadGroup(
            this.consumerGroup,
            this.consumerName,
            [
              {
                key: 'validation_requests',
                id: '>' // Only new messages
              }
            ],
            {
              COUNT: 10,
              BLOCK: 5000 // Block for 5 seconds
            }
          );
        }

        if (messages && messages.length > 0) {
          for (const stream of messages) {
            for (const message of stream.messages) {
              await this.processMessage(message.id, message.message);
              
              // Acknowledge message
              await client.xAck('validation_requests', this.consumerGroup, message.id);
            }
          }
        }
      } catch (error) {
        console.error('[RedisWorker] Error consuming messages:', error);
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(messageId: string, messageData: any) {
    try {
      console.log(`[RedisWorker] Processing message: ${messageId}`);
      
      const data = JSON.parse(messageData.data);
      const requestId = data.request_id;
      const source = data.source;
      
      console.log(`[RedisWorker] Request ID: ${requestId}, Source: ${source}`);

      // Process based on source
      if (source === 'extension') {
        await this.processExtensionData(requestId, data);
      } else {
        console.log(`[RedisWorker] Unknown source: ${source}`);
      }
      
    } catch (error) {
      console.error(`[RedisWorker] Error processing message ${messageId}:`, error);
    }
  }

  /**
   * Process extension data
   */
  private async processExtensionData(requestId: string, data: any) {
    try {
      console.log(`[RedisWorker] Processing extension data for request: ${requestId}`);
      
      const items = data.data?.items || [];
      console.log(`[RedisWorker] Processing ${items.length} items`);

      // Ensure strapi instance is available
      if (!this.strapi) {
        console.error('[RedisWorker] Strapi instance not available, trying global');
        this.strapi = (global as any).strapi;
      }
      
      if (!this.strapi) {
        throw new Error('Strapi instance not available for processing');
      }

      console.log(`[RedisWorker] Creating ListingProcessor with strapi instance:`, !!this.strapi);
      const listingProcessor = new ListingProcessorService(this.strapi);
      const results = [];

      // Process each item
      for (const item of items) {
        try {
          // Parse price from string format "33.990.000" to number
          const parsePrice = (priceStr: any) => {
            if (typeof priceStr === 'number') return priceStr;
            if (!priceStr) return 0;
            // Remove dots and convert to number
            return parseInt(String(priceStr).replace(/\./g, '').replace(/[^0-9]/g, '') || '0');
          };

          // Debug: Log raw data from extension
          console.log('[RedisWorker] Raw item data:', JSON.stringify({
            review_product: item.review?.product,
            product: item.product,
            review: item.review
          }, null, 2));

          // Transform data format for listing processor
          const shopeeData = {
            product: {
              // Try multiple fields for product title
              title: item.review?.product?.productName || 
                     item.product?.title || 
                     '[Livestream] Điện Thoại Samsung Galaxy S25 Ultra 256GB',
              productUrl: item.review?.product?.productUrl || 
                         item.product?.url || 
                         item.url || '',
              // Use actual product description, not review comment
              description: item.product?.description || 
                          item.review?.product?.description || 
                          item.description || '',
              // Parse price from multiple possible fields
              price: item.review?.product?.priceVND || 
                     parsePrice(item.product?.price) || 
                     parsePrice(item.review?.product?.price) || 0,
              currency: item.product?.currency || 'VND',
              category: item.review?.product?.categories?.join(' > ') || 
                       item.product?.category || '',
              brand: item.review?.product?.brand || 
                     item.product?.brand || '',
              images: item.review?.images || 
                     item.product?.images || [],
              stock: item.review?.product?.stock || 
                    item.product?.stock || 0,
              shipFrom: item.review?.product?.shipFrom || 
                       item.product?.shipFrom || '',
              rating: parseFloat(item.review?.product?.rating || '0'),
              soldCount: parseInt(item.review?.product?.soldCount?.replace(/[^0-9]/g, '') || '0')
            },
            seller: {
              name: item.review?.product?.sellerName || 
                    item.seller?.name || '',
              rating: parseFloat(item.review?.product?.sellerRating || item.seller?.rating || '0'),
              responseRate: item.review?.product?.sellerResponseRate || 
                           item.seller?.responseRate || '',
              responseTime: item.review?.product?.sellerResponseTime || 
                           item.seller?.responseTime || '',
              joinSince: item.review?.product?.sellerJoinSince || 
                        item.seller?.joinSince || '',
              productCount: parseInt(item.review?.product?.sellerProductCount || 
                                   item.seller?.productCount || '0'),
              // Parse followerCount and reviewCount from "580,6k" format
              followerCount: parseInt((item.review?.product?.sellerFollowerCount || 
                                      item.seller?.followerCount || '0')
                                      .replace(/[,\.]/g, '')
                                      .replace(/k$/i, '000') || '0'),
              reviewCount: parseInt((item.review?.product?.sellerReviewCount || 
                                    item.seller?.reviewCount || '0')
                                    .replace(/[,\.]/g, '')
                                    .replace(/k$/i, '000') || '0')
            },
            review: item.review || {}
          };

          const result = await listingProcessor.processShopeeData(shopeeData);
          results.push({
            ...result,
            success: true
          });
          
          console.log(`[RedisWorker] Processed item: ${result.message}`);
        } catch (error) {
          console.error('[RedisWorker] Error processing item:', error);
          results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Publish response
      await this.publishResponse(requestId, {
        status: 'completed',
        processed: results.length,
        results: results
      });
      
      console.log(`[RedisWorker] Completed processing request: ${requestId}`);
      
    } catch (error) {
      console.error(`[RedisWorker] Error processing extension data:`, error);
      
      // Publish error response
      await this.publishResponse(requestId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Publish response to Redis Stream
   */
  private async publishResponse(requestId: string, response: any) {
    try {
      const client = (redisStreamService as any).client;
      
      const message = {
        request_id: requestId,
        response: {
          ...response,
          processedAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };

      await client.xAdd(
        'extension_responses',
        '*',
        { data: JSON.stringify(message) }
      );

      console.log(`[RedisWorker] Published response for request: ${requestId}`);
    } catch (error) {
      console.error('[RedisWorker] Error publishing response:', error);
    }
  }
}

// Export singleton instance
const redisWorkerService = new RedisWorkerService();
export default redisWorkerService;