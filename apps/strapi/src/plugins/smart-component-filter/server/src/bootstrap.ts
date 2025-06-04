import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => {
  // Register custom field type
  strapi.customFields.register({
    name: 'dynamic-field',
    plugin: 'smart-component-filter',
    type: 'json',
    inputSize: {
      // Max width for the field in the content manager
      default: 12,
      isResizable: true,
    },
  });

  // Log successful registration
  strapi.log.info('[Smart Component Filter] Custom field "dynamic-field" registered successfully');
};
