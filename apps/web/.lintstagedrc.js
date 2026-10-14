const path = require("path")

const buildEslintCommand = (filenames) => {
  const files = filenames
    .filter(
      (f) =>
        f.endsWith(".ts") ||
        f.endsWith(".tsx") ||
        f.endsWith(".js") ||
        f.endsWith(".jsx")
    )
    .map((f) => {
      // lint-staged executes commands with cwd = directory of .lintstagedrc.js (__dirname)
      const relativePath = path.relative(__dirname, f).replace(/\\/g, "/")
      return `"${relativePath}"`
    })

  if (files.length === 0) {
    return 'echo "No files to lint"'
  }

  return `eslint --fix --no-error-on-unmatched-pattern ${files.join(" ")}`
}

module.exports = {
  "src/**/*.{js,jsx,ts,tsx}": [buildEslintCommand],
}