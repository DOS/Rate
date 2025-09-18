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
  },
}
