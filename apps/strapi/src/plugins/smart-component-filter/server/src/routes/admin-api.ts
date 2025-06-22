export default [
  {
    method: 'GET',
    path: '/components',
    handler: 'controller.getAvailableComponents',
    config: {
      policies: ['admin::isAuthenticatedAdmin'],
    },
  },
  {
    method: 'GET',
    path: '/health',
    handler: 'controller.index',
    config: {
      policies: ['admin::isAuthenticatedAdmin'],
    },
  },
]; 