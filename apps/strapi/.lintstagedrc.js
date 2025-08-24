const path = require('path')

const buildEslintCommand = (filenames) =>
  `eslint --fix --max-warnings=0 ${filenames
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js'))
    .map((f) => path.relative(process.cwd(), f))
    .join(' ')}`

module.exports = {
  'src/**/*.{ts,tsx,js}': [buildEslintCommand],
}



