/**
 * Test endpoint for auto-generate PropertyList feature
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/items/test-auto-generate',
      handler: 'item.testAutoGenerate',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
