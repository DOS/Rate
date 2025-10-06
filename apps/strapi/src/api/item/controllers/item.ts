/**
 * item controller
 */

import { factories } from "@strapi/strapi"

export default factories.createCoreController("api::item.item", ({ strapi }) => ({
  /**
   * Test auto-generate PropertyList feature
   */
  async testAutoGenerate(ctx) {
    try {
      console.log('\n🧪 Testing Auto-Generate PropertyList Feature\n');

      // 1. Find or create "Cellphones" category
      let categories = await strapi.entityService.findMany('api::category.category', {
        filters: { Name: 'Cellphones' },
        limit: 1,
      });

      let category: any;

      // Get all property components dynamically
      const propertyComponents = Object.keys(strapi.components)
        .filter(key => key.startsWith('property.'))
        .sort();

      if (!categories || categories.length === 0) {
        category = await strapi.entityService.create('api::category.category', {
          data: {
            Name: 'Cellphones',
            Type: 'Product',
            PropertyList: propertyComponents,
          },
        });
        console.log('✅ Created new category:', category.id);
      } else {
        category = categories[0];
        category = await strapi.entityService.update('api::category.category', category.id, {
          data: {
            PropertyList: propertyComponents,
          },
        });
        console.log('✅ Updated existing category:', category.id);
      }

      // 2. Create new Item with this Category
      const item: any = await strapi.entityService.create('api::item.item', {
        data: {
          Title: 'Test Phone ' + Date.now(),
          Category: category.id,
          ItemType: 'Product',
        },
        populate: {
          PropertyList: true,
          Category: { fields: ['id', 'Name'] },
        },
      });

      console.log('✅ Created Item:', item.id);
      console.log('📦 PropertyList:', item.PropertyList);

      ctx.body = {
        success: true,
        item: {
          id: item.id,
          title: item.Title,
          category: category.Name,
          propertyListCount: item.PropertyList?.length || 0,
          propertyList: item.PropertyList,
        },
      };
    } catch (error: any) {
      console.error('❌ Test failed:', error);
      ctx.body = {
        success: false,
        error: error.message,
      };
    }
  },
}))
