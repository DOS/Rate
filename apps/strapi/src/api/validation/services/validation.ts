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
async function ensureRedis() {
  if (redisClient) return redisClient;
  try {
    // Use node-redis v5 API
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const redis = require('redis');
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    const client = redis.createClient({ url, socket: { reconnectStrategy: (retries: number) => Math.min(retries * 50, 5000) } });
    client.on('error', (err: any) => strapi.log.error('Redis error', err));
    await client.connect();
    redisClient = client;
    strapi.log.info('Validation service connected to Redis');
    return redisClient;
  } catch (e) {
    strapi.log.warn('Redis not available, falling back to in-memory validation queue');
    return null;
  }
}

async function publishToRedis(items: unknown[], options: EnqueueOptions) {
  try {
    const client = await ensureRedis();
    if (!client) {
      strapi.log.warn('Redis not available for validation');
      return null;
    }
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      request_id: requestId,
      source: 'extension',
      action: 'validate',
      data: { items: Array.isArray(items) ? items : [items] },
      priority: options.priority || 'normal',
      callback_config: { stream: 'extension_responses', webhook_url: options.webhookUrl || null },
      timestamp: new Date().toISOString(),
    };
    await client.xAdd('validation_requests', '*', { data: JSON.stringify(payload) });
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
    try {
      const requestId = await publishToRedis(items, options);
      if (requestId) {
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
      // ignore and fall back
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    memoryStore.set(requestId, {
      requestId,
      status: 'queued',
      total: Array.isArray(items) ? items.length : 1,
      validated: 0,
      errors: [],
    });
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


