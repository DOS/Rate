export default [
  {
    method: 'GET',
    path: '/schema/:listingTypeId',
    handler: 'dynamic-field.getSchema',
    config: {
      policies: ['admin::isAuthenticatedAdmin'],
    },
  },
  {
    method: 'POST',
    path: '/validate',
    handler: 'dynamic-field.validateData',
    config: {
      policies: ['admin::isAuthenticatedAdmin'],
    },
  },
  {
    method: 'GET',
    path: '/components',
    handler: 'dynamic-field.getAvailableComponents',
    config: {
      policies: ['admin::isAuthenticatedAdmin'],
    },
  },
  {
    method: 'GET',
    path: '/component/:componentName',
    handler: 'dynamic-field.getComponentSchema',
    config: {
      policies: ['admin::isAuthenticatedAdmin'],
    },
  },
  {
    method: 'GET',
    path: '/health',
    handler: 'dynamic-field.healthCheck',
    config: {
      policies: ['admin::isAuthenticatedAdmin'],
    },
  },
]; 