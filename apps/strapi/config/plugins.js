module.exports = {
  // Enable Smart Component Filter plugin with custom field
  'smart-component-filter': {
    enabled: true,
    resolve: './src/plugins/smart-component-filter'
  },
  // Temporarily disable CKEditor to fix Prism error
  'ckeditor5': {
    enabled: false,
  },
}; 