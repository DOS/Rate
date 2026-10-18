import base from '@repo/eslint-config/base';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['**/*.js', '**/*.cjs', '**/*.mjs', 'dist/**'] },
  ...base,
  {
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
