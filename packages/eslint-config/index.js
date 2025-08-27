module.exports = {
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  env: { node: true, es2022: true, browser: false },
  overrides: [
    {
      files: ["**/*.tsx", "**/*.ts"],
      parserOptions: { project: true },
    },
    {
      files: ["apps/web/**/*"],
      env: { browser: true },
      extends: ["plugin:react/recommended", "plugin:react-hooks/recommended"],
      settings: { react: { version: "detect" } },
    },
  ],
}
