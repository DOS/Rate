"use strict"

const redisStreamService = require('./services/redisStream');

module.exports = {
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
  async bootstrap({ strapi }) {
    try {
      // Initialize Redis Stream Service
      await redisStreamService.connect();
      strapi.log.info('Redis Stream Service initialized successfully');

      // Subscribe to response streams for real-time updates
      redisStreamService.subscribeToResponses('extension_responses', async (data) => {
        strapi.log.info('Received extension response:', data.request_id);
        // TODO: Handle WebSocket notifications here
      });

      redisStreamService.subscribeToResponses('importer_responses', async (data) => {
        strapi.log.info('Received importer response:', data.request_id);
        // TODO: Handle webhook callbacks here
      });
    } catch (error) {
      strapi.log.error('Failed to initialize Redis Stream Service:', error);
      // Continue without Redis if it fails to connect
    }
  },
}
