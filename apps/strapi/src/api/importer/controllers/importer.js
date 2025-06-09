'use strict';

const redisStreamService = require('../../../services/redisStream');

module.exports = {
  async import(ctx) {
    try {
      const { body } = ctx.request;
      
      // Validate input
      if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
        return ctx.badRequest('No items provided for import');
      }

      // Get API token info
      const apiToken = ctx.state.auth?.credentials?.name || 'importer';
      
      // Publish to Redis Stream
      const result = await redisStreamService.publishValidationRequest({
        items: body.items,
        userId: apiToken,
        priority: body.priority || 'batch',
        webhookUrl: body.webhookUrl,
        metadata: {
          source: body.source || 'checkscam.com',
          importedAt: new Date().toISOString(),
          totalItems: body.items.length
        }
      }, 'importer');

      ctx.body = {
        success: true,
        requestId: result.requestId,
        message: 'Import request submitted successfully',
        itemCount: body.items.length,
        status: 'queued'
      };
    } catch (error) {
      strapi.log.error('Import error:', error);
      ctx.internalServerError('Failed to process import request');
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
          status: 'processing',
          message: 'Import is still being processed'
        };
      } else {
        ctx.body = {
          success: true,
          requestId,
          status: status.status || 'completed',
          results: status.results,
          processedAt: status.processed_at,
          statistics: status.statistics,
          message: status.message
        };
      }
    } catch (error) {
      strapi.log.error('Import status check error:', error);
      ctx.internalServerError('Failed to check import status');
    }
  },

  async bulkImport(ctx) {
    try {
      const { body } = ctx.request;
      
      // Validate input
      if (!body.datasets || !Array.isArray(body.datasets) || body.datasets.length === 0) {
        return ctx.badRequest('No datasets provided for bulk import');
      }

      const apiToken = ctx.state.auth?.credentials?.name || 'importer';
      const results = [];
      
      // Process each dataset
      for (const dataset of body.datasets) {
        if (!dataset.items || dataset.items.length === 0) {
          continue;
        }

        const result = await redisStreamService.publishValidationRequest({
          items: dataset.items,
          userId: apiToken,
          priority: dataset.priority || body.priority || 'bulk',
          webhookUrl: dataset.webhookUrl || body.webhookUrl,
          metadata: {
            source: dataset.source || body.source || 'checkscam.com',
            datasetId: dataset.id,
            importedAt: new Date().toISOString(),
            totalItems: dataset.items.length,
            tags: dataset.tags || []
          }
        }, 'importer');
        
        results.push({
          datasetId: dataset.id,
          requestId: result.requestId,
          itemCount: dataset.items.length,
          source: dataset.source || body.source || 'checkscam.com'
        });
      }

      ctx.body = {
        success: true,
        message: 'Bulk import requests submitted successfully',
        datasets: results,
        totalDatasets: results.length,
        totalItems: results.reduce((sum, r) => sum + r.itemCount, 0)
      };
    } catch (error) {
      strapi.log.error('Bulk import error:', error);
      ctx.internalServerError('Failed to process bulk import request');
    }
  }
};
