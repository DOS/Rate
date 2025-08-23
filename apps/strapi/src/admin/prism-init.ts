// Initialize Prism globally before other modules need it
// This fixes the "Prism is not defined" error in Strapi 5.23.0

// Create a minimal Prism object if it doesn't exist
if (typeof window !== 'undefined' && !window.Prism) {
  window.Prism = {
    manual: true,
    disableWorkerMessageHandler: true,
    
    // Minimal implementation to prevent errors
    languages: {},
    plugins: {},
    hooks: {
      add: function() {},
      run: function() {}
    },
    
    // Stub for highlight function
    highlight: function(text: string) {
      return text;
    },
    
    // Stub for highlightAll
    highlightAll: function() {},
    
    // Stub for highlightElement  
    highlightElement: function() {},
    
    // Token class stub
    Token: function(this: any, type: string, content: any, alias?: any, matchedStr?: string, greedy?: boolean) {
      this.type = type;
      this.content = content;
      this.alias = alias;
      this.length = matchedStr ? matchedStr.length : 0;
      this.greedy = !!greedy;
    }
  } as any;
  
  console.log('[Prism Init] Prism polyfill created');
}

// Now try to load the real Prism if available
try {
  const Prism = require('prismjs');
  if (typeof window !== 'undefined') {
    window.Prism = Prism;
    console.log('[Prism Init] Real Prism loaded');
  }
} catch (e) {
  console.log('[Prism Init] Using Prism polyfill');
}

export default window.Prism;