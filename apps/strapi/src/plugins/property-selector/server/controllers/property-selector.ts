export default {
  async getComponents(ctx: any) {
    try {
      // Get all property.* components from strapi.components
      const propertyComponents = Object.keys(strapi.components)
        .filter(key => key.startsWith('property.'))
        .sort();

      ctx.body = {
        components: propertyComponents,
      };
    } catch (error: any) {
      ctx.throw(500, error);
    }
  },
};
