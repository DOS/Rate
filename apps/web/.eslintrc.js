/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  // The react/react-hooks override in @repo/eslint-config (`apps/web/**/*`) is resolved
  // relative to this directory and never matches, so the presets are applied here.
  extends: [
    "@repo/eslint-config",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
  ],
  parser: "@typescript-eslint/parser",
  // @next/next is registered (not extended) so inline disables of its rules resolve.
  plugins: ["jsx-a11y", "@next/next"],
  settings: {
    tailwindcss: {
      callees: ["cn"],
      config: "tailwind.config.js",
    },
  },
  parserOptions: {
    project: true,
  },
  rules: {
    "no-console": ["warn", { allow: ["warn", "error"] }],
    "@next/next/no-html-link-for-pages": "off",
    // @typescript-eslint/no-unused-vars covers TS and JS; the base rule only duplicates it
    // and misreports parameter names in TS function types.
    "no-unused-vars": "off",
    // A leading underscore marks a binding as intentionally unused.
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
    "react/function-component-definition": "off",
    "react/hook-use-state": "off",
    "react/jsx-no-leaked-render": "off",
    "react/jsx-sort-props": "off",
    "react/no-array-index-key": "off",
    "react/no-unstable-nested-components": [
      "warn",
      {
        allowAsProps: true,
        customValidators: [],
      },
    ],
    "tailwindcss/no-custom-classname": "off",
    "turbo/no-undeclared-env-vars": "off",
    "no-extra-boolean-cast": "warn",
    "jsx-a11y/alt-text": [
      "error",
      {
        elements: ["img", "object", "area", "input[type='image']"],
        img: ["Image"],
        object: ["Object"],
        area: ["Area"],
        "input[type='image']": ["InputImage"],
      },
    ],
    "jsx-a11y/no-autofocus": "off",
    // `interface X extends Y {}` is how next-intl message typings are declared.
    "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }],
  },
  overrides: [
    {
      // The architecture suite lazily require()s each section's modules (CommonJS under tsx).
      files: ["src/**/__tests__/**"],
      rules: { "@typescript-eslint/no-require-imports": "off" },
    },
    {
      // JS config files (.eslintrc.js, prettier.config.js, ...) are not in the
      // TypeScript project; no enabled rule needs type information anyway.
      files: ["*.js", "*.cjs", "*.mjs"],
      parserOptions: { project: null },
      // apps/web is CommonJS ("type" is unset), so its .js config files use require().
      rules: { "@typescript-eslint/no-require-imports": "off" },
    },
    {
      files: ["src/components/ui/*.tsx"],
      rules: {
        "tailwindcss/enforces-shorthand": "off",
        "react/jsx-curly-brace-presence": "off",
        "tailwindcss/no-unnecessary-arbitrary-value": "off",
      },
    },
  ],
}
