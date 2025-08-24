export default {
  async ping(ctx: any) {
    ctx.body = { status: 'ok', time: new Date().toISOString() };
  },
  async debugPeek(ctx: any) {
    const countParam = ctx?.query?.count;
    const count = Math.min(Math.max(parseInt(countParam || '5', 10) || 5, 1), 50);
    try {
      // Lazy init redis
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const redis = require('redis');
      const url = process.env.REDIS_URL || 'redis://localhost:6379';
      const client = redis.createClient({ url });
      await client.connect();
      const entries = await client.xRevRange('validation_requests', '+', '-', { COUNT: count });
      const messages = entries.map((m: any) => {
        try {
          return { id: m?.id, payload: JSON.parse(m?.message?.data) };
        } catch (_) {
          return { id: m?.id, payload: m?.message?.data };
        }
      });
      await client.quit();
      ctx.body = { count: messages.length, messages };
    } catch (e: any) {
      ctx.status = 500;
      ctx.body = { error: 'redis_unavailable', details: e?.message };
    }
  },
  async validate(ctx: any) {
    const { items = [], priority, webhookUrl } = ctx.request.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return ctx.badRequest('items must be a non-empty array');
    }

    const requestId = await strapi.service('api::validation.validation').enqueueValidation(items, {
      priority,
      webhookUrl,
    } as any);

    ctx.body = { requestId, status: 'queued' };
  },

  async batchValidate(ctx: any) {
    const { batches = [], priority, webhookUrl } = ctx.request.body || {};

    if (!Array.isArray(batches) || batches.length === 0) {
      return ctx.badRequest('batches must be a non-empty array');
    }

    const results: { id: string; requestId: string }[] = [];

    for (const batch of batches) {
      const items = Array.isArray(batch.items) ? batch.items : [];
      if (items.length === 0) continue;
      const requestId = await strapi.service('api::validation.validation').enqueueValidation(items, {
        priority: batch.priority || priority,
        webhookUrl: batch.webhookUrl || webhookUrl,
      } as any);
      results.push({ id: batch.id || requestId, requestId });
    }

    ctx.body = { results };
  },

  async getStatus(ctx: any) {
    const { requestId } = ctx.params || {};
    if (!requestId) return ctx.badRequest('requestId is required');

    const status = await strapi.service('api::validation.validation').getStatus(requestId);
    ctx.body = status || { requestId, status: 'unknown' };
  },
};
