// Prism polyfill to fix "Prism is not defined" error in Strapi 5.23.0
// This creates a minimal Prism object to prevent errors
window.Prism = window.Prism || {
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
  highlight: function(text, grammar, language) {
    return text;
  },
  
  // Stub for highlightAll
  highlightAll: function() {},
  
  // Stub for highlightElement
  highlightElement: function() {},
  
  // Token class stub
  Token: function(type, content, alias, matchedStr, greedy) {
    this.type = type;
    this.content = content;
    this.alias = alias;
    this.length = matchedStr ? matchedStr.length : 0;
    this.greedy = !!greedy;
  }
};

console.log('[Prism Fix] Prism polyfill loaded');