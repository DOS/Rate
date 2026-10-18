import base from '@repo/eslint-config/base';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Only TypeScript is linted here (the old `eslint . --ext .ts`).
  { ignores: ['**/*.js', '**/*.cjs', '**/*.mjs'] },
  ...base,
  {
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },
  {
    files: [
      'src/shopee/logger.ts',
      'src/shopee/__tests__/**/*.ts',
      'src/shopee/test-*.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },
];
