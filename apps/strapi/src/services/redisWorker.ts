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
        // Read messages from stream
        const messages = await client.xReadGroup(
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

      const listingProcessor = new ListingProcessorService(this.strapi as Core.Strapi);
      const results = [];

      // Process each item
      for (const item of items) {
        try {
          // Transform data format for listing processor
          const shopeeData = {
            product: {
              title: item.review?.product?.productName || '',
              productUrl: item.review?.product?.productUrl || item.url || '',
              description: item.review?.comment || '',
              price: item.review?.product?.priceVND || 0,
              currency: 'VND',
              category: item.review?.product?.categories?.join(' > ') || '',
              brand: item.review?.product?.brand || '',
              images: item.review?.images || [],
              stock: item.review?.product?.stock || 0,
              shipFrom: item.review?.product?.shipFrom || ''
            },
            seller: {
              name: item.review?.product?.sellerName || '',
              rating: 0,
              responseRate: item.review?.product?.sellerResponseRate || '',
              responseTime: item.review?.product?.sellerResponseTime || '',
              joinSince: item.review?.product?.sellerJoinSince || '',
              productCount: parseInt(item.review?.product?.sellerProductCount || '0'),
              followerCount: parseInt(item.review?.product?.sellerFollowerCount?.replace(/[^0-9]/g, '') || '0') * 1000,
              reviewCount: parseInt(item.review?.product?.sellerReviewCount?.replace(/[^0-9]/g, '') || '0') * 1000
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