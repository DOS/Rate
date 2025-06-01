"use strict"

/**
 * item controller
 */

const { createCoreController } = require("@strapi/strapi").factories

module.exports = createCoreController("api::item.item", ({ strapi }) => ({
  /**
   * Get schema for a specific listing type
   */
  async getSchema(ctx) {
    try {
      const { listingTypeKey } = ctx.params

      if (!listingTypeKey) {
        return ctx.badRequest("Listing type key is required")
      }

      const fieldSchemaService = strapi.service("field-schema")
      const schema = await fieldSchemaService.getItemSchema(listingTypeKey)

      ctx.send({
        data: schema,
        meta: {
          listingType: listingTypeKey,
          timestamp: new Date().toISOString(),
        },
      })
    } catch (error) {
      strapi.log.error("Error in getSchema controller:", error)

      if (error.message.includes("not found")) {
        return ctx.notFound(error.message)
      }

      return ctx.internalServerError("Failed to fetch schema")
    }
  },
}))
