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

  // Get all available components in the system
  {
    method: 'GET',
    path: '/components',
    handler: 'controller.getAvailableComponents',
    config: {
      policies: [],
      auth: false,
    },
  },
];
