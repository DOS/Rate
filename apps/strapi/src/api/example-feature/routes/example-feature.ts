/**
 * Example Feature routes
 * Owner: Cursor
 */

export default {
  routes: [
    // Default CRUD routes are automatically generated
    // These are custom routes
    {
      method: 'POST',
      path: '/example-features/bulk-delete',
      handler: 'example-feature.bulkDelete',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/example-features/stats',
      handler: 'example-feature.stats',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};