// Shared flat config (ESLint 9) for the Rate monorepo.
// typescript-eslint runs on the TypeScript 6 API through .pnpmfile.cjs until it
// supports TypeScript 7 (https://github.com/typescript-eslint/typescript-eslint/issues/10940).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
const base = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/build/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2022 },
    },
  },
];

export default base;
