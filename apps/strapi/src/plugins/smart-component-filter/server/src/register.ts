import type { Core } from '@strapi/strapi';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  // Register custom field on server side for Strapi v5
  strapi.customFields.register({
    name: 'component-multi-select',
    plugin: 'smart-component-filter',
    type: 'json',
  });
  
  // Smart Component Filter server registered
};

export default register;
