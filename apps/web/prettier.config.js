const globalConfig = require('@repo/prettier-config');

/** @type {import('prettier').Config} */
module.exports = {
  ...globalConfig,
  // Resolve from this package (see packages/prettier-config/prettier.config.js).
  plugins: [
    ...globalConfig.plugins,
    require.resolve('prettier-plugin-tailwindcss'),
  ],
};
