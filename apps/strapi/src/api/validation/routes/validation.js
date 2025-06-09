'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/validation/validate',
      handler: 'validation.validate',
      config: {
        auth: {
          strategies: ['api-token', 'jwt'],
          scope: ['find', 'create']
        },
        middlewares: [],
        policies: []
      }
    },
    {
      method: 'GET',
      path: '/validation/status/:requestId',
      handler: 'validation.getStatus',
      config: {
        auth: {
          strategies: ['api-token', 'jwt'],
          scope: ['find']
        },
        middlewares: [],
        policies: []
      }
    },
    {
      method: 'POST',
      path: '/validation/batch',
      handler: 'validation.batchValidate',
      config: {
        auth: {
          strategies: ['api-token', 'jwt'],
          scope: ['find', 'create']
        },
        middlewares: [],
        policies: []
      }
    }
  ]
};
