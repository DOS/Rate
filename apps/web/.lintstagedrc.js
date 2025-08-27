const path = require("path")

const buildEslintCommand = (filenames) =>
  `eslint --fix --max-warnings=0 ${filenames
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx'))
    .map((f) => `"${path.relative(process.cwd(), f).replace(/\\\\/g, '/')}"`)
    .join(' ')}`

module.exports = {
  "src/**/*.{js,jsx,ts,tsx}": [buildEslintCommand],
}
