import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => {
  // Server bootstrap - no custom field registration here
  // Custom fields are registered in admin/src/index.tsx
  strapi.log.info('[Smart Component Filter] Server bootstrap completed');
  
  // Note: Smart loading middleware has been removed
  // Plugin now only provides Component Multi-Select field functionality
};
