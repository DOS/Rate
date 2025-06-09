'use strict';

const redisStreamService = require('../../../services/redisStream');

module.exports = {
  async validate(ctx) {
    try {
      const { body } = ctx.request;
      
      // Validate input
      if (!body.items || (Array.isArray(body.items) && body.items.length === 0)) {
        return ctx.badRequest('No items provided for validation');
      }

      const userId = ctx.state.user?.id || 'anonymous';
      
      // Publish to Redis Stream
      const result = await redisStreamService.publishValidationRequest({
        items: body.items,
        userId,
        priority: body.priority || 'normal',
        webhookUrl: body.webhookUrl
      }, 'extension');

      ctx.body = {
        success: true,
        requestId: result.requestId,
        message: 'Validation request submitted successfully',
        status: 'pending'
      };
    } catch (error) {
      strapi.log.error('Validation error:', error);
      ctx.internalServerError('Failed to process validation request');
    }
  },

  async getStatus(ctx) {
    try {
      const { requestId } = ctx.params;
      
      if (!requestId) {
        return ctx.badRequest('Request ID is required');
      }

      const status = await redisStreamService.getRequestStatus(requestId);
      
      if (!status) {
        ctx.body = {
          success: false,
          requestId,
          status: 'pending',
          message: 'Request is still being processed'
        };
      } else {
        ctx.body = {
          success: true,
          requestId,
          status: status.status || 'completed',
          results: status.results,
          processedAt: status.processed_at,
          message: status.message
        };
      }
    } catch (error) {
      strapi.log.error('Status check error:', error);
      ctx.internalServerError('Failed to check validation status');
    }
  },

  async batchValidate(ctx) {
    try {
      const { body } = ctx.request;
      
      // Validate input
      if (!body.batches || !Array.isArray(body.batches) || body.batches.length === 0) {
        return ctx.badRequest('No batches provided for validation');
      }

      const userId = ctx.state.user?.id || 'anonymous';
      const results = [];
      
      // Process each batch
      for (const batch of body.batches) {
        const result = await redisStreamService.publishValidationRequest({
          items: batch.items,
          userId,
          priority: batch.priority || body.priority || 'normal',
          webhookUrl: batch.webhookUrl || body.webhookUrl,
          batchId: batch.id
        }, 'extension');
        
        results.push({
          batchId: batch.id,
          requestId: result.requestId,
          itemCount: batch.items.length
        });
      }

      ctx.body = {
        success: true,
        message: 'Batch validation requests submitted successfully',
        batches: results,
        totalBatches: results.length,
        totalItems: results.reduce((sum, r) => sum + r.itemCount, 0)
      };
    } catch (error) {
      strapi.log.error('Batch validation error:', error);
      ctx.internalServerError('Failed to process batch validation request');
    }
  }
};
