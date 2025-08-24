/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["@repo/eslint-config"],
  root: true,
  ignorePatterns: [
    ".eslintrc.js",
    "types/generated/**",
    ".cache/**",
    "public/admin/**",
  ],
}
