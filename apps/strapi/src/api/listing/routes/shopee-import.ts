export default {
  routes: [
    {
      method: 'POST',
      path: '/listings/shopee-import',
      handler: 'listing.shopeeImport',
      config: {
        auth: false, // Public endpoint for extension
        policies: [],
        middlewares: [],
      },
    },
  ],
};