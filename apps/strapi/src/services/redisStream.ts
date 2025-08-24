import type { Core } from '@strapi/strapi';
import { createClient, RedisClientType } from 'redis';
import ListingProcessorService from './listingProcessor';

/**
 * Redis Stream Service
 * Xử lý Redis Streams cho validation requests và responses
 */

interface ValidationRequest {
  request_id: string;
  source: 'extension' | 'importer';
  user_id: string;
  action: string;
  data: {
    items: any[];
  };
  priority: string;
  callback_config: {
    stream: string;
    webhook_url?: string;
  };
  timestamp: string;
}

interface ExtensionResponse {
  request_id: string;
  response: {
    status: 'completed' | 'failed';
    result?: any;
    error?: string;
    processedAt: string;
  };
  timestamp: string;
}

class RedisStreamService {
  private client: RedisClientType | null = null;
  private strapi: Core.Strapi;
  
  // Stream names
  private requestStream = 'validation_requests';
  private responseStream = 'extension_responses';
  private importResponseStream = 'importer_responses';
  private dlqStream = 'validation_dlq';

  constructor(strapiInstance?: Core.Strapi) {
    this.strapi = strapiInstance || (global as any).strapi;
  }

  /**
   * Khởi tạo Redis connection
   */
  async initialize(): Promise<void> {
    try {
      const url = process.env.REDIS_URL || 'redis://localhost:6379';
      this.client = createClient({ url });
      
      this.client.on('error', (err) => {
        if (this.strapi?.log) {
          this.strapi.log.error('Redis Client Error:', err);
        } else {
          console.error('Redis Client Error:', err);
        }
      });

      this.client.on('connect', () => {
        if (this.strapi?.log) {
          this.strapi.log.info('Redis Stream Service: Connected');
        } else {
          console.log('Redis Stream Service: Connected');
        }
      });

      this.client.on('reconnect', () => {
        if (this.strapi?.log) {
          this.strapi.log.info('Redis Stream Service: Reconnected');
        } else {
          console.log('Redis Stream Service: Reconnected');
        }
      });

      await this.client.connect();
      if (this.strapi?.log) {
        this.strapi.log.info('Redis Stream Service: Initialized');
      } else {
        console.log('Redis Stream Service: Initialized');
      }
      
    } catch (error) {
      if (this.strapi?.log) {
        this.strapi.log.error('Redis Stream Service: Failed to initialize', error);
      } else {
        console.error('Redis Stream Service: Failed to initialize', error);
      }
      throw error;
    }
  }

  /**
   * Đảm bảo Redis connection
   */
  private async ensureConnected(): Promise<void> {
    if (!this.client || !this.client.isReady) {
      await this.initialize();
    }
  }

  /**
   * Publish validation request vào Redis Stream
   */
  async publishValidationRequest(data: any, source: 'extension' | 'importer' = 'extension'): Promise<{ requestId: string; message: ValidationRequest }> {
    await this.ensureConnected();

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const message: ValidationRequest = {
      request_id: requestId,
      source,
      user_id: data.userId || 'anonymous',
      action: data.action || 'validate',
      data: {
        items: Array.isArray(data.items) ? data.items : [data.items]
      },
      priority: data.priority || 'normal',
      callback_config: {
        stream: source === 'extension' ? this.responseStream : this.importResponseStream,
        webhook_url: data.webhookUrl || null
      },
      timestamp: new Date().toISOString()
    };

    try {
      await this.client!.xAdd(
        this.requestStream,
        '*',
        { data: JSON.stringify(message) }
      );

      console.log(`Published validation request: ${requestId}`);
      return { requestId, message };
    } catch (error) {
      console.error('Failed to publish validation request:', error);
      throw error;
    }
  }

  /**
   * Subscribe to response streams
   */
  async subscribeToResponses(stream: string, callback: (data: any) => void, lastId: string = '$'): Promise<void> {
    await this.ensureConnected();

    try {
      while (true) {
        const response = await this.client!.xRead(
          { key: stream, id: lastId },
          { COUNT: 1, BLOCK: 5000 }
        );

        if (response && response.length > 0) {
          for (const streamData of response) {
            for (const message of streamData.messages) {
              try {
                const data = JSON.parse(message.message.data);
                callback(data);
                lastId = message.id;
              } catch (error) {
                console.error('Error parsing response message:', error);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in response subscription:', error);
      throw error;
    }
  }

  /**
   * Get request status từ response stream
   */
  async getRequestStatus(requestId: string): Promise<any> {
    await this.ensureConnected();

    try {
      const messages = await this.client!.xRevRange(
        this.responseStream,
        '+',
        '-',
        { COUNT: 100 }
      );

      for (const message of messages) {
        try {
          const data = JSON.parse(message.message.data);
          if (data.request_id === requestId) {
            return data.response;
          }
        } catch (error) {
          console.error('Error parsing status message:', error);
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting request status:', error);
      return null;
    }
  }

  /**
   * Xử lý validation request từ Redis Stream
   */
  async processValidationRequest(requestId: string, messageData: any): Promise<any> {
    try {
      console.log(`[RedisStream] Processing validation request: ${requestId}`);
      
      const data = JSON.parse(messageData.data);
      const source = data.source || 'unknown';
      
      // Xử lý data từ extension
      if (source === 'extension') {
        return await this.processExtensionData(requestId, data);
      }
      
      // Xử lý data từ importer
      if (source === 'importer') {
        return await this.processImporterData(requestId, data);
      }
      
      console.log(`[RedisStream] Unknown source: ${source}`);
      return { success: false, error: 'Unknown source' };
      
    } catch (error) {
      console.error(`[RedisStream] Error processing validation request: ${requestId}`, error);
      throw error;
    }
  }

  /**
   * Xử lý data từ extension (Shopee)
   */
  private async processExtensionData(requestId: string, data: any): Promise<any> {
    try {
      console.log(`[RedisStream] Processing extension data for request: ${requestId}`);
      
      // Import ListingProcessor service
      const listingProcessor = new ListingProcessorService();
      
      // Xử lý batch data và tạo listings
      const result = await listingProcessor.processBatchFromRedis(data);
      
      // Publish kết quả vào extension_responses stream
      await this.publishExtensionResponse(requestId, {
        status: 'completed',
        result: result,
        processedAt: new Date().toISOString()
      });
      
      console.log(`[RedisStream] Extension data processed successfully: ${requestId}`);
      return { success: true, result };
      
    } catch (error) {
      console.error(`[RedisStream] Error processing extension data: ${requestId}`, error);
      
      // Publish error response
      await this.publishExtensionResponse(requestId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        processedAt: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Xử lý data từ importer
   */
  private async processImporterData(requestId: string, data: any): Promise<any> {
    try {
      console.log(`[RedisStream] Processing importer data for request: ${requestId}`);
      
      // TODO: Implement importer data processing
      const result = { success: true, message: 'Importer data processed' };
      
      // Publish kết quả vào importer_responses stream
      await this.publishImporterResponse(requestId, {
        status: 'completed',
        result: result,
        processedAt: new Date().toISOString()
      });
      
      return { success: true, result };
      
    } catch (error) {
      console.error(`[RedisStream] Error processing importer data: ${requestId}`, error);
      throw error;
    }
  }

  /**
   * Publish response cho extension
   */
  private async publishExtensionResponse(requestId: string, responseData: any): Promise<void> {
    try {
      await this.ensureConnected();
      
      const message: ExtensionResponse = {
        request_id: requestId,
        response: responseData,
        timestamp: new Date().toISOString()
      };

      await this.client!.xAdd(
        this.responseStream,
        '*',
        { data: JSON.stringify(message) }
      );

      console.log(`[RedisStream] Published extension response: ${requestId}`);
      
    } catch (error) {
      console.error(`[RedisStream] Error publishing extension response: ${requestId}`, error);
    }
  }

  /**
   * Publish response cho importer
   */
  private async publishImporterResponse(requestId: string, responseData: any): Promise<void> {
    try {
      await this.ensureConnected();
      
      const message = {
        request_id: requestId,
        response: responseData,
        timestamp: new Date().toISOString()
      };

      await this.client!.xAdd(
        this.importResponseStream,
        '*',
        { data: JSON.stringify(message) }
      );

      console.log(`[RedisStream] Published importer response: ${requestId}`);
      
    } catch (error) {
      console.error(`[RedisStream] Error publishing importer response: ${requestId}`, error);
    }
  }

  /**
   * Disconnect Redis client
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      console.log('Redis Stream Service: Disconnected');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureConnected();
      await this.client!.ping();
      return true;
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
const redisStreamService = new RedisStreamService();
export default redisStreamService;

