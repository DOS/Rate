import type { Core } from '@strapi/strapi';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  // Register custom field on server side for Strapi v5
  strapi.customFields.register({
    name: 'component-multi-select',
    plugin: 'smart-component-filter',
    type: 'json',
  });
  
  console.log('✅ Smart Component Filter server registered');
  console.log('✅ Custom Field registered in server');
};

export default register;
