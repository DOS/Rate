import type { Core } from '@strapi/strapi';

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  index(ctx) {
    ctx.body = strapi
      .plugin('smart-component-filter')
      .service('service')
      .getWelcomeMessage();
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
