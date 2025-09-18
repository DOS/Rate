/**
 * Validation routes (ingest API)
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/validation/ping',
      handler: 'validation.ping',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/validation/debug/peek',
      handler: 'validation.debugPeek',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/validation/validate',
      handler: 'validation.validate',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/validation/batch',
      handler: 'validation.batchValidate',
      config: {
        auth: {
          strategies: ['api-token', 'jwt'],
          scope: ['api::validation.validation.batchValidate'],
        },
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/validation/status/:requestId',
      handler: 'validation.getStatus',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
