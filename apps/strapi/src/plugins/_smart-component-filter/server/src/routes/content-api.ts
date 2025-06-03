export default [
  {
    method: 'GET',
    path: '/',
    // name of the controller file & the method.
    handler: 'controller.index',
    config: {
      policies: [],
    },
  },

  // Get allowed components for a specific ListingType
  {
    method: 'GET',
    path: '/listing-type/:listingTypeId/components',
    handler: 'controller.getAllowedComponents',
    config: {
      policies: [],
      auth: false, // Allow without authentication for now
    },
  },

  // Get all available components in the system
  {
    method: 'GET',
    path: '/components',
    handler: 'controller.getAvailableComponents',
    config: {
      policies: [],
      auth: false, // Allow without authentication for now
    },
  },
];
