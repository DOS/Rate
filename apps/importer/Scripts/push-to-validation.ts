import axios from 'axios';
import Redis from 'ioredis';

interface ValidationOptions {
  strapiUrl?: string;
  strapiToken?: string;
  useRedis?: boolean;
  redisHost?: string;
  redisPort?: number;
  streamName?: string;
  batchSize?: number;
}

interface ScamRecord {
  id?: string;
  url: string;
  title: string;
  description: string;
  category: string;
  reportCount: number;
  lastReported: string;
  status: string;
  tags: string[];
  metadata: {
    source: string;
    crawledAt: string;
    batch?: string;
    [key: string]: any;
  };
}

interface BatchMetadata {
  batchId: string;
  source: string;
  timestamp?: string;
  totalRecords?: number;
}

interface ValidationRequest {
  records: ScamRecord[];
  metadata: BatchMetadata;
  requestId: string;
  timestamp: string;
}

export default class ValidationPusher {
  private strapiUrl: string;
  private strapiToken: string;
  private useRedis: boolean;
  private redis?: Redis;
  private streamName: string;
  private batchSize: number;

  constructor(options: ValidationOptions = {}) {
    this.strapiUrl = options.strapiUrl || process.env.STRAPI_URL || 'http://localhost:1337';
    this.strapiToken = options.strapiToken || process.env.STRAPI_API_TOKEN || '';
    this.useRedis = options.useRedis !== false; // Default to true
    this.streamName = options.streamName || 'validation_requests';
    this.batchSize = options.batchSize || 50;

    // Redis setup
    if (this.useRedis) {
      this.redis = new Redis({
        host: options.redisHost || process.env.REDIS_HOST || 'localhost',
        port: options.redisPort || parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        retryStrategy: (times: number) => Math.min(times * 100, 2000)
      });

      this.redis.on('error', (error: Error) => {
        console.warn('Redis connection error:', error.message);
        console.log('Falling back to direct Strapi push');
        this.useRedis = false;
      });
    }
  }

  async pushBatch(records: ScamRecord[], metadata: BatchMetadata): Promise<void> {
    const requestId = `${metadata.batchId}_${Date.now()}`;
    
    console.log(`📤 Pushing batch to validation: ${records.length} records`);

    // Split into smaller batches if needed
    const batches = this.chunkArray(records, this.batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchRequestId = `${requestId}_${i + 1}`;
      
      const validationRequest: ValidationRequest = {
        records: batch,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          totalRecords: batch.length
        },
        requestId: batchRequestId,
        timestamp: new Date().toISOString()
      };

      try {
        if (this.useRedis && this.redis) {
          await this.pushToRedisStream(validationRequest);
        } else {
          await this.pushToStrapi(validationRequest);
        }
        
        console.log(`✅ Pushed batch ${i + 1}/${batches.length}: ${batch.length} records`);
        
      } catch (error) {
        console.error(`❌ Failed to push batch ${i + 1}/${batches.length}:`, error);
        
        // Try fallback method
        try {
          if (this.useRedis && this.redis) {
            console.log('🔄 Falling back to direct Strapi push');
            await this.pushToStrapi(validationRequest);
            console.log(`✅ Fallback successful for batch ${i + 1}`);
          }
        } catch (fallbackError) {
          console.error(`💥 Fallback also failed for batch ${i + 1}:`, fallbackError);
          throw fallbackError;
        }
      }
    }

    console.log(`🎉 All batches pushed successfully: ${records.length} total records`);
  }

  private async pushToRedisStream(request: ValidationRequest): Promise<void> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    const streamData = {
      requestId: request.requestId,
      timestamp: request.timestamp,
      batchId: request.metadata.batchId,
      source: request.metadata.source,
      recordCount: request.records.length.toString(),
      payload: JSON.stringify(request)
    };

    await this.redis.xadd(
      this.streamName,
      '*', // Auto-generate ID
      'data', JSON.stringify(streamData)
    );

    console.log(`📡 Pushed to Redis stream: ${this.streamName}`);
  }

  private async pushToStrapi(request: ValidationRequest): Promise<void> {
    if (!this.strapiToken) {
      console.warn('⚠️  No Strapi API token provided, skipping direct push');
      return;
    }

    const endpoint = `${this.strapiUrl}/api/importer/validation-requests`;
    
    const response = await axios.post(endpoint, {
      data: {
        requestId: request.requestId,
        batchId: request.metadata.batchId,
        source: request.metadata.source,
        recordCount: request.records.length,
        payload: request,
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    }, {
      headers: {
        'Authorization': `Bearer ${this.strapiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Strapi API error: ${response.status} ${response.statusText}`);
    }

    console.log(`📨 Pushed to Strapi API: ${endpoint}`);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  // Test connection
  async testConnection(): Promise<{ redis: boolean; strapi: boolean }> {
    const results = { redis: false, strapi: false };

    // Test Redis
    if (this.useRedis && this.redis) {
      try {
        await this.redis.ping();
        results.redis = true;
        console.log('✅ Redis connection OK');
      } catch (error) {
        console.warn('❌ Redis connection failed:', error);
      }
    }

    // Test Strapi
    if (this.strapiToken) {
      try {
        const response = await axios.get(`${this.strapiUrl}/api/users/me`, {
          headers: { 'Authorization': `Bearer ${this.strapiToken}` },
          timeout: 5000
        });
        
        if (response.status === 200) {
          results.strapi = true;
          console.log('✅ Strapi API connection OK');
        }
      } catch (error) {
        console.warn('❌ Strapi API connection failed:', error);
      }
    }

    return results;
  }
}

// CLI support for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const pusher = new ValidationPusher();
  
  pusher.testConnection()
    .then((results) => {
      console.log('Connection test results:', results);
      process.exit(results.redis || results.strapi ? 0 : 1);
    })
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    })
    .finally(() => {
      pusher.close();
    });
}
