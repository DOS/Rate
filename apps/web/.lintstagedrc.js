const path = require("path")

const buildPrettierCommand = (filenames) => {
  const files = filenames
    .filter(
      (f) =>
        f.endsWith(".ts") ||
        f.endsWith(".tsx") ||
        f.endsWith(".js") ||
        f.endsWith(".jsx")
    )
    .map((f) => {
      const relativePath = path.relative(__dirname, f).replace(/\\/g, "/")
      return `"${relativePath}"`
    })

  if (files.length === 0) {
    return 'echo "No files to format"'
  }

  return `prettier --write --ignore-unknown ${files.join(" ")}`
}

module.exports = {
  "src/**/*.{js,jsx,ts,tsx}": [buildPrettierCommand],
}