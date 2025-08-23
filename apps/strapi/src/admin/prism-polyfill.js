// Prism polyfill - loaded before everything else
window.Prism = window.Prism || {
  manual: true,
  disableWorkerMessageHandler: true,
  languages: {},
  plugins: {},
  hooks: {
    add: function() {},
    run: function() {}
  },
  highlight: function(text) {
    return text;
  },
  highlightAll: function() {},
  highlightElement: function() {},
  Token: function(type, content, alias, matchedStr, greedy) {
    this.type = type;
    this.content = content;
    this.alias = alias;
    this.length = matchedStr ? matchedStr.length : 0;
    this.greedy = !!greedy;
  }
};

console.log('[Prism Polyfill] Loaded');