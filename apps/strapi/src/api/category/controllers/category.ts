/**
 * category controller
 */

import { factories } from "@strapi/strapi"

export default factories.createCoreController("api::category.category", ({ strapi }) => ({
  async getType(ctx) {
    const { id } = ctx.params;
    
    try {
      const category = await strapi.entityService.findOne('api::category.category', id, {
        fields: ['Type', 'Name']
      });
      
      if (!category) {
        return ctx.notFound('Category not found');
      }
      
      return ctx.send({
        data: {
          id,
          type: category.Type,
          name: category.Name
        }
      });
    } catch (error) {
      return ctx.badRequest('Error fetching category type');
    }
  }
}))
