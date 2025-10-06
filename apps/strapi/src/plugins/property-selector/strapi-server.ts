export default ({ strapi }: any) => ({
  register() {
    // Register routes
    strapi.server.routes([
      {
        method: 'GET',
        path: '/property-selector/components',
        handler: 'plugin::property-selector.property-selector.getComponents',
        config: {
          policies: [],
          auth: false,
        },
      },
    ]);
  },

  bootstrap() {
    // Plugin bootstrap
  },

  controllers: {
    'property-selector': {
      async getComponents(ctx: any) {
        try {
          // Get all property.* components from strapi.components
          const propertyComponents = Object.keys(strapi.components)
            .filter((key: string) => key.startsWith('property.'))
            .sort();

          ctx.body = {
            components: propertyComponents,
          };
        } catch (error: any) {
          ctx.throw(500, error);
        }
      },
    },
  },
});
