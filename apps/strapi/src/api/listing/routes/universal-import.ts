export default {
  routes: [
    {
      method: 'POST',
      path: '/listings/import',
      handler: 'listing.universalImport',
      config: {
        auth: false, // Public endpoint for extension
        policies: [],
        middlewares: [],
      },
    },
  ],
};