'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/importer/import',
      handler: 'importer.import',
      config: {
        auth: {
          strategies: ['api-token'],
          scope: ['find', 'create']
        },
        middlewares: [],
        policies: []
      }
    },
    {
      method: 'GET',
      path: '/importer/status/:requestId',
      handler: 'importer.getStatus',
      config: {
        auth: {
          strategies: ['api-token'],
          scope: ['find']
        },
        middlewares: [],
        policies: []
      }
    },
    {
      method: 'POST',
      path: '/importer/bulk',
      handler: 'importer.bulkImport',
      config: {
        auth: {
          strategies: ['api-token'],
          scope: ['find', 'create']
        },
        middlewares: [],
        policies: []
      }
    }
  ]
};
