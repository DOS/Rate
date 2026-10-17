import nextPlugin from '@next/eslint-plugin-next';
import base from '@repo/eslint-config/base';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const serviceRoleImportBan = {
  name: '@repo/shared-data/server',
  message:
    'Service-role clients bypass RLS. Use the anon client (lib/rate-api) or authenticateRateRequest (server/rate/request-auth).',
};

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['next-env.d.ts', 'public/**', 'coverage/**'] },
  ...base,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  jsxA11y.flatConfigs.recommended,
  {
    settings: { react: { version: 'detect' } },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      'react-hooks': reactHooks,
      // Registered (not extended) so inline disables of its rules resolve.
      '@next/next': nextPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Service-role clients bypass RLS. Web routes must act as the anon role or as the
      // signed-in user (src/server/rate/request-auth.ts), never as service_role.
      'no-restricted-imports': ['error', { paths: [serviceRoleImportBan] }],
      '@next/next/no-html-link-for-pages': 'off',
      // @typescript-eslint/no-unused-vars covers TS and JS; the base rule only duplicates it
      // and misreports parameter names in TS function types.
      'no-unused-vars': 'off',
      // A leading underscore marks a binding as intentionally unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'react/function-component-definition': 'off',
      'react/hook-use-state': 'off',
      'react/jsx-no-leaked-render': 'off',
      'react/jsx-sort-props': 'off',
      'react/no-array-index-key': 'off',
      'react/no-unstable-nested-components': ['warn', { allowAsProps: true, customValidators: [] }],
      'no-extra-boolean-cast': 'warn',
      'jsx-a11y/alt-text': [
        'error',
        {
          elements: ['img', 'object', 'area', "input[type='image']"],
          img: ['Image'],
          object: ['Object'],
          area: ['Area'],
          "input[type='image']": ['InputImage'],
        },
      ],
      'jsx-a11y/no-autofocus': 'off',
      // `interface X extends Y {}` is how next-intl message typings are declared.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
    },
  },
  {
    // The architecture suite lazily require()s each section's modules (CommonJS under tsx).
    files: ['src/**/__tests__/**'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // JS config files are not in the TypeScript project; no enabled rule needs type
    // information. apps/web is CommonJS ("type" is unset), so .js configs use require().
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: { parserOptions: { projectService: false } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['src/app/**', 'src/server/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='SUPABASE_SERVICE_ROLE_KEY']",
          message:
            'Never use SUPABASE_SERVICE_ROLE_KEY in apps/web (src/app/** or src/server/**). Use the anon client (getRateClient) or a user-scoped client.',
        },
      ],
    },
  },
  {
    files: ['src/components/**', 'src/app/[[]locale]/components/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // A later block replaces the rule options, so the service-role ban is repeated.
          paths: [
            {
              name: '@/lib/rate-api',
              message:
                "Client Components must import pure helpers and types from '@/lib/rate-domain' instead of '@/lib/rate-api' (Audit T12).",
            },
            {
              name: '@/server/rate',
              message:
                "Client Components must import pure helpers and types from '@/lib/rate-domain' instead of '@/server/rate' (Audit T12).",
            },
            serviceRoleImportBan,
          ],
        },
      ],
    },
  },
];
