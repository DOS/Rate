export default {
  routes: [
    {
      method: 'POST',
      path: '/listings/direct-import',
      handler: 'listing.directImport',
      config: {
        auth: false, // Public endpoint for testing
        policies: [],
        middlewares: [],
      },
    },
  ],
};