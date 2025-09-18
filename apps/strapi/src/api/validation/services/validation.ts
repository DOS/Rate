type ValidationStatus = 'queued' | 'processing' | 'completed' | 'error';

interface EnqueueOptions {
  priority?: string;
  webhookUrl?: string | null;
}

interface StatusRecord {
  requestId: string;
  status: ValidationStatus;
  total?: number;
  validated?: number;
  errors?: { index: number; reason: string }[];
}

const memoryStore = new Map<string, StatusRecord>();

// Lazy Redis client (optional)
let redisClient: any = null;
let redisConnecting = false;

async function ensureRedis() {
  if (redisClient) return redisClient;
  if (redisConnecting) return null; // Prevent multiple concurrent connection attempts
  
  redisConnecting = true;
  try {
    // Use node-redis v5 API
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const redis = require('redis');
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    const client = redis.createClient({ 
      url, 
      socket: { 
        connectTimeout: 5000, // 5 second timeout
        reconnectStrategy: (retries: number) => Math.min(retries * 50, 5000) 
      } 
    });
    client.on('error', (err: any) => strapi.log.error('Redis error', err));
    
    // Add timeout to connect
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);
    
    redisClient = client;
    strapi.log.info('Validation service connected to Redis');
    return redisClient;
  } catch (e: any) {
    strapi.log.warn('Redis not available, falling back to in-memory validation queue:', e.message);
    return null;
  } finally {
    redisConnecting = false;
  }
}

async function publishToRedis(items: unknown[], options: EnqueueOptions) {
  try {
    // Use the existing redisStream service that's already initialized
    const redisStreamService = (global as any).strapi?.services?.redisStream;
    if (!redisStreamService) {
      strapi.log.warn('RedisStream service not available');
      return null;
    }
    
    // Publish using the existing service
    const { requestId } = await redisStreamService.publishValidationRequest({
      items: Array.isArray(items) ? items : [items],
      priority: options.priority || 'normal',
      webhookUrl: options.webhookUrl || null
    }, 'extension');
    
    strapi.log.info(`Published validation request ${requestId} to Redis`);
    return requestId;
  } catch (error: any) {
    strapi.log.error('Failed to publish to Redis:', error.message);
    return null;
  }
}

// Custom service (not bound to any content-type)
export default () => ({
  async enqueueValidation(items: unknown[], options: EnqueueOptions = {}) {
    // Try to publish to Redis first
    try {
      const requestId = await publishToRedis(items, options);
      if (requestId) {
        // Store status in memory for tracking
        memoryStore.set(requestId, {
          requestId,
          status: 'queued',
          total: Array.isArray(items) ? items.length : 1,
          validated: 0,
          errors: [],
        });
        return requestId;
      }
    } catch (e) {
      strapi.log.warn('Failed to publish to Redis, using fallback');
    }

    // Fallback if Redis is not available - process immediately
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    memoryStore.set(requestId, {
      requestId,
      status: 'processing',
      total: Array.isArray(items) ? items.length : 1,
      validated: 0,
      errors: [],
    });

    // Process immediately in background when Redis is not available
    setTimeout(async () => {
      try {
        strapi.log.info(`Processing validation request ${requestId} directly (no Redis)`);

        // Use the ListingProcessor directly since validation just wraps it
        const ListingProcessorService = require('../../../services/listingProcessor').default;
        const listingProcessor = new ListingProcessorService(strapi);

        let validated = 0;
        const errors: any[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i] as any;
          try {
            // Process each item directly
            if (item && item.product) {
              await listingProcessor.processShopeeData({
                product: item.product,
                seller: item.seller,
                review: item.reviews?.[0]
              });
              validated++;
            } else {
              errors.push({ index: i, reason: 'Invalid item structure' });
            }
          } catch (error: any) {
            strapi.log.error(`Error processing item ${i}:`, error);
            errors.push({ index: i, reason: error.message });
          }
        }

        // Update status
        memoryStore.set(requestId, {
          requestId,
          status: 'completed',
          total: items.length,
          validated,
          errors,
        });

        strapi.log.info(`Completed validation request ${requestId}: ${validated}/${items.length} validated`);
      } catch (error: any) {
        strapi.log.error(`Failed to process validation request ${requestId}:`, error);
        memoryStore.set(requestId, {
          requestId,
          status: 'error',
          total: items.length,
          validated: 0,
          errors: [{ index: -1, reason: error.message }],
        });
      }
    }, 100); // Small delay to allow response to be sent

    return requestId;
  },

  async getStatus(requestId: string) {
    try {
      const client = await ensureRedis();
      if (client) {
        const ext = await client.xRange('extension_responses', '-', '+', { COUNT: 100 });
        for (const m of ext) {
          try {
            const data = JSON.parse(m.message.data);
            if (data.request_id === requestId) {
              return { requestId, status: data.status || 'completed', details: data } as any;
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
    return memoryStore.get(requestId);
  },
});


