import type { Core } from '@strapi/strapi';

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  index(ctx) {
    ctx.body = strapi
      .plugin('smart-component-filter')
      // the name of the service file & the method.
      .service('service')
      .getWelcomeMessage();
  },

  // Get allowed components for a specific ListingType
  async getAllowedComponents(ctx) {
    try {
      const { listingTypeId } = ctx.params;
      
      if (!listingTypeId) {
        ctx.status = 400;
        return {
          success: false,
          error: 'ListingType ID is required',
          data: null
        };
      }

      const allowedComponents = await strapi
        .plugin('smart-component-filter')
        .service('service')
        .getAllowedComponents(listingTypeId);

      return {
        success: true,
        data: allowedComponents
      };
    } catch (error) {
      // Handle error silently
      ctx.status = 500;
      return {
        success: false,
        error: 'Internal server error',
        details: error.message,
        data: null
      };
    }
  },

  // Get all available components in the system
  async getAvailableComponents(ctx) {
    try {
      const availableComponents = await strapi
        .plugin('smart-component-filter')
        .service('service')
        .getAvailableComponents();

      ctx.body = {
        data: {
          components: availableComponents.components,
          totalCount: availableComponents.totalCount,
          categories: availableComponents.categories
        },
        success: true
      };
    } catch (error) {
      ctx.badRequest('Failed to get available components', { details: error.message });
    }
  }
});

export default controller;
