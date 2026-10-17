import base from '@repo/eslint-config/base';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Only TypeScript is linted here (the old `eslint . --ext .ts`).
  { ignores: ['**/*.js', '**/*.cjs', '**/*.mjs'] },
  ...base,
  {
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
