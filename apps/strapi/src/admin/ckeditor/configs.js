export const defaultCkEditorConfig = {
  toolbar: [
    'heading',
    '|',
    'bold',
    'italic',
    'link',
    'bulletedList',
    'numberedList',
    '|',
    'outdent',
    'indent',
    '|',
    'blockQuote',
    'insertTable',
    'undo',
    'redo'
  ],
  heading: {
    options: [
      { model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
      { model: 'heading1', view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1' },
      { model: 'heading2', view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
      { model: 'heading3', view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' }
    ]
  },
  // Enable code highlighting with proper Prism.js configuration
  codeBlock: {
    languages: [
      { language: 'plaintext', label: 'Plain text' },
      { language: 'javascript', label: 'JavaScript' },
      { language: 'typescript', label: 'TypeScript' },
      { language: 'css', label: 'CSS' },
      { language: 'html', label: 'HTML' },
      { language: 'json', label: 'JSON' }
    ]
  },
  // Ensure Prism.js is properly loaded
  language: 'en'
}; 