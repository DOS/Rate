import type { Core } from '@strapi/strapi';

/**
 * Dynamic Field Controller
 * Handle API requests cho dynamic field functionality
 */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Load schema cho một Listing Type
   * GET /smart-component-filter/schema/:listingTypeId
   */
  async getSchema(ctx: any) {
    try {
      const { listingTypeId } = ctx.params;

      if (!listingTypeId || isNaN(parseInt(listingTypeId))) {
        return ctx.badRequest('Invalid listing type ID');
      }

      const schemaLoader = strapi.plugin('smart-component-filter').service('schema-loader');
      const schema = await schemaLoader.loadSchemaFromListingType(parseInt(listingTypeId));

      if (!schema) {
        return ctx.notFound('Schema not found for this listing type');
      }

      ctx.body = {
        success: true,
        data: schema,
      };
    } catch (error) {
      strapi.log.error('[Dynamic Field Controller] Error getting schema:', error);
      ctx.internalServerError('Failed to load schema');
    }
  },

  /**
   * Validate field data against schema
   * POST /smart-component-filter/validate
   */
  async validateData(ctx: any) {
    try {
      const { listingTypeId, data } = ctx.request.body;

      if (!listingTypeId || !data) {
        return ctx.badRequest('Missing listingTypeId or data');
      }

      const schemaLoader = strapi.plugin('smart-component-filter').service('schema-loader');
      
      // Load schema
      const schema = await schemaLoader.loadSchemaFromListingType(listingTypeId);
      if (!schema) {
        return ctx.notFound('Schema not found for this listing type');
      }

      // Validate data
      const validation = await schemaLoader.validateFieldData(data, schema);

      ctx.body = {
        success: true,
        data: validation,
      };
    } catch (error) {
      strapi.log.error('[Dynamic Field Controller] Error validating data:', error);
      ctx.internalServerError('Failed to validate data');
    }
  },

  /**
   * Get available components cho một category
   * GET /smart-component-filter/components
   */
  async getAvailableComponents(ctx: any) {
    try {
      const { categoryId } = ctx.query;

      const schemaLoader = strapi.plugin('smart-component-filter').service('schema-loader');
      const components = await schemaLoader.getAvailableComponents(
        categoryId ? parseInt(categoryId) : undefined
      );

      ctx.body = {
        success: true,
        data: components,
      };
    } catch (error) {
      strapi.log.error('[Dynamic Field Controller] Error getting components:', error);
      ctx.internalServerError('Failed to get available components');
    }
  },

  /**
   * Get component schema chi tiết
   * GET /smart-component-filter/component/:componentName
   */
  async getComponentSchema(ctx: any) {
    try {
      const { componentName } = ctx.params;

      if (!componentName) {
        return ctx.badRequest('Component name is required');
      }

      // Get component schema từ Strapi registry
      const componentSchema = strapi.components[componentName];

      if (!componentSchema) {
        return ctx.notFound('Component not found');
      }

      const schema = {
        name: componentName,
        displayName: componentSchema.info?.displayName || componentName,
        description: componentSchema.info?.description,
        attributes: componentSchema.attributes || {},
        category: componentSchema.category,
        info: componentSchema.info,
      };

      ctx.body = {
        success: true,
        data: schema,
      };
    } catch (error) {
      strapi.log.error('[Dynamic Field Controller] Error getting component schema:', error);
      ctx.internalServerError('Failed to get component schema');
    }
  },

  /**
   * Health check endpoint
   * GET /smart-component-filter/health
   */
  async healthCheck(ctx: any) {
    ctx.body = {
      success: true,
      message: 'Smart Component Filter plugin is running',
      timestamp: new Date().toISOString(),
    };
  },
}); 