/**
 * Property Components Controller
 * Provides list of available property components for admin UI
 */

export default {
  async list(ctx: any) {
    try {
      // Get all property.* components from strapi.components
      const propertyComponents = Object.keys(strapi.components)
        .filter(key => key.startsWith('property.'))
        .sort()
        .map(key => ({
          value: key,
          label: key.replace('property.', '').charAt(0).toUpperCase() +
                 key.replace('property.', '').slice(1),
        }));

      ctx.body = {
        components: propertyComponents,
      };
    } catch (error: any) {
      ctx.throw(500, error);
    }
  },
};
