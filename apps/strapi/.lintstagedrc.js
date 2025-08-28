const path = require('path')

const buildEslintCommand = (filenames) => {
  const files = filenames
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js'))
    .map((f) => {
      // Convert absolute path to relative path from current working directory
      let relativePath = path.relative(process.cwd(), f)
      // Replace backslashes with forward slashes for cross-platform compatibility  
      relativePath = relativePath.replace(/\\/g, '/')
      // Return the path without quotes - ESLint will handle the escaping
      return relativePath
    })
  
  // If no files match, return a no-op command
  if (files.length === 0) {
    return 'echo "No files to lint"'
  }
  
  // Join files and let ESLint handle the escaping
  return `eslint --fix --max-warnings=0 ${files.join(' ')}`
}

module.exports = {
  'src/**/*.{ts,tsx,js}': [buildEslintCommand],
}