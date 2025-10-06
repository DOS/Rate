import type { Core } from '@strapi/strapi';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.log.info('🔧 Rate Admin plugin register() called');
  
  // Register routes
  strapi.server.routes([
    {
      method: 'GET',
      path: '/rate-admin/property-components',
      handler: 'plugin::rate-admin.rate-admin.getComponents',
      config: {
        policies: [],
        auth: false,
      },
    },
  ]);
};

const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.log.info('🎨 Rate Admin plugin bootstrapped');
};

const controllers = {
  'rate-admin': {
    async getComponents(ctx: any) {
      try {
        const components = Object.keys(strapi.components)
          .filter((key: string) => key.startsWith('property.'))
          .sort()
          .map((key: string) => ({
            value: key,
            label: key.replace('property.', '').charAt(0).toUpperCase() + 
                   key.replace('property.', '').slice(1),
          }));
        
        ctx.body = { components };
      } catch (error) {
        strapi.log.error('Error in rate-admin getComponents:', error);
        ctx.throw(500, error);
      }
    },
  },
};

export default {
  register,
  bootstrap,
  controllers,
};
