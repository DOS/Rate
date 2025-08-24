/**
 * Example Feature controller
 * Owner: Cursor
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::example-feature.example-feature', ({ strapi }) => ({
  /**
   * Custom find action with additional filtering
   */
  async find(ctx: any) {
    const { query } = ctx;
    
    // Call the default core action
    const { data, meta } = await super.find(ctx);
    
    // Add custom response modifications
    return {
      data,
      meta: {
        ...meta,
        customField: 'Example custom metadata',
      },
    };
  },

  /**
   * Custom create action with validation
   */
  async create(ctx: any) {
    const { data } = ctx.request.body;
    
    // Custom validation
    if (!data.title || data.title.length < 3) {
      return ctx.badRequest('Title must be at least 3 characters long');
    }
    
    // Add default values
    const enrichedData = {
      ...data,
      metadata: {
        ...data.metadata,
        createdVia: 'API',
        version: '1.0.0',
      },
    };
    
    ctx.request.body.data = enrichedData;
    
    // Call the default core action
    const response = await super.create(ctx);
    
    // Post-creation hooks
    await strapi.service('api::example-feature.example-feature').afterCreate(response.data);
    
    return response;
  },

  /**
   * Custom bulk action example
   */
  async bulkDelete(ctx: any) {
    const { ids } = ctx.request.body;
    
    if (!ids || !Array.isArray(ids)) {
      return ctx.badRequest('IDs array is required');
    }
    
    const results = await Promise.all(
      ids.map(id => 
        strapi.service('api::example-feature.example-feature').delete(id)
      )
    );
    
    return {
      data: {
        deleted: results.filter(Boolean).length,
        failed: ids.length - results.filter(Boolean).length,
      },
    };
  },

  /**
   * Custom statistics endpoint
   */
  async stats(ctx: any) {
    const stats = await strapi.service('api::example-feature.example-feature').getStatistics();
    
    return {
      data: stats,
    };
  },
}));