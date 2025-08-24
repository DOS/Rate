// Entry point that ensures Prism is available before anything else loads
// This fixes "Prism is not defined" error in Strapi 5.23.0

// Create global Prism stub
(window as any).Prism = (window as any).Prism || {
  manual: true,
  disableWorkerMessageHandler: true,
  languages: {},
  plugins: {},
  hooks: {
    add: () => {},
    run: () => {}
  },
  highlight: (text: string) => text,
  highlightAll: () => {},
  highlightElement: () => {},
  Token: class {
    constructor(public type: string, public content: any, public alias?: any) {}
  }
};

console.log('[Entry] Prism stub created');

// Now import the actual app
import('./app');