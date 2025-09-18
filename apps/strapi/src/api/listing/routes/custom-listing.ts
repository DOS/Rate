/**
 * Custom listing routes for direct integration with extension
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/listings/create',
      handler: 'listing.createListing',
      config: {
        auth: false, // Allow extension to post without auth
        policies: [],
        middlewares: [],
      },
    },
  ],
};