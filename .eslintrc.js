/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ["@repo/eslint-config"],
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/build/**",
    "apps/strapi/.cache/**",
    "apps/strapi/public/admin/**",
    "apps/strapi/types/generated/**",
    "apps/web/next-env.d.ts",
  ],
}



