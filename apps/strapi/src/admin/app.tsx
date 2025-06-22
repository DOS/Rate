import { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    // Global admin configuration
  },
  bootstrap(app: StrapiApp) {
    console.log("🎯 [ADMIN] Admin app bootstrapped - Smart loading disabled");
    // All smart loading functionality has been disabled
  },
};
