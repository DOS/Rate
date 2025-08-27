export default {
  routes: [
    {
      method: 'POST',
      path: '/listings/test-processor',
      handler: 'listing.testProcessor',
      config: {
        auth: false, // Make it public for testing
        policies: [],
        middlewares: [],
      },
    },
  ],
};