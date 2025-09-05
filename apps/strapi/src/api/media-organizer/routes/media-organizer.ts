export default {
  routes: [
    {
      method: 'POST',
      path: '/organize-media',
      handler: 'media-organizer.organize',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};