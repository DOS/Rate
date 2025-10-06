import type { Core } from "@strapi/strapi"

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/*{ strapi }*/) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // Ensure Public role can read categories (find, findOne)
    try {
      const publicRole = await strapi.db
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: 'public' }, populate: ['permissions'] })

      if (publicRole) {
        const neededActions = [
          'api::category.category.find',
          'api::category.category.findOne',
          'api::item.item.find',
          'api::item.item.findOne',
        ]

        const existing = new Set(
          (publicRole as any).permissions?.map((p: any) => p.action) || []
        )

        for (const action of neededActions) {
          if (!existing.has(action)) {
            await strapi.db.query('plugin::users-permissions.permission').create({
              data: {
                action,
                role: publicRole.id,
              },
            })
            strapi.log.info(`Granted Public permission: ${action}`)
          }
        }
      }
    } catch (e) {
      strapi.log.warn('Failed to ensure Public role permissions for Category:', e)
    }
    
    // Set strapi globally for services
    (global as any).strapi = strapi;

    // Initialize BullMQ Queue Service with proper context
    try {
      const bullmqService = require('./services/bullmqQueue');
      await bullmqService.initializeQueue(strapi);
      (global as any).bullmqService = bullmqService;
      strapi.log.info('BullMQ Queue Service initialized with polling processor');
    } catch (error) {
      strapi.log.error('BullMQ initialization failed:', error);
    }

    // Setup test Category for auto-generate PropertyList feature
    try {
      // Log all available property components for admin reference
      const propertyComponents = Object.keys(strapi.components)
        .filter(key => key.startsWith('property.'))
        .sort();

      strapi.log.info(`📦 Available property components: ${propertyComponents.join(', ')}`);

      const categories = await strapi.entityService.findMany('api::category.category', {
        filters: { Name: 'Cellphones' },
        limit: 1,
      });

      if (categories && categories.length > 0) {
        const category: any = categories[0];

        // Just log current PropertyList (configured by admin), don't override
        if (category.PropertyList && Array.isArray(category.PropertyList)) {
          strapi.log.info(`✅ Cellphones category (ID: ${category.id}) has ${category.PropertyList.length} selected components:`, category.PropertyList);
        } else {
          strapi.log.warn(`⚠️ Cellphones category (ID: ${category.id}) has no PropertyList configured. Please set PropertyList in admin panel.`);
        }

        // Create test Item to verify auto-generation (only if PropertyList is configured)
        if (category.PropertyList && Array.isArray(category.PropertyList) && category.PropertyList.length > 0) {
          const testItem: any = await strapi.entityService.create('api::item.item', {
            data: {
              Title: `Test Phone ${Date.now()}`,
              Category: category.id,
              ItemType: 'Product',
            },
            populate: {
              PropertyList: true,
            },
          });

          if (testItem.PropertyList && testItem.PropertyList.length > 0) {
            strapi.log.info(`✅ TEST PASSED! Auto-generated ${testItem.PropertyList.length} PropertyList components for Item ${testItem.id}`);
            testItem.PropertyList.forEach((comp: any, idx: number) => {
              strapi.log.info(`   ${idx + 1}. ${comp.__component}`);
            });
          } else {
            strapi.log.error(`❌ TEST FAILED! PropertyList NOT auto-generated for Item ${testItem.id}`);
          }
        }
      }
    } catch (error) {
      strapi.log.warn('Failed to setup test category:', error);
    }
  },
}
