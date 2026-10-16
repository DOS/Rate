/** @type {import('prettier').Config} */
module.exports = {
  endOfLine: 'lf',
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
  useTabs: false,
  // Prettier resolves bare plugin names from process.cwd() (the repo root), where
  // pnpm does not hoist this package's devDependencies. Resolve from here instead.
  plugins: [require.resolve('prettier-plugin-packagejson')],
};
