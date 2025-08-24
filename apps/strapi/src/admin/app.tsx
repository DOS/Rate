// Fix for "Prism is not defined" error in Strapi 5.23.0
if (typeof window !== 'undefined' && !window.Prism) {
  (window as any).Prism = {
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
}

import './prism-init';
import { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    locales: [
      // 'ar',
      // 'fr',
      'cs',
      'vi',
      // 'de',
      // 'dk',
      // 'es',
      // 'he',
      // 'id',
      // 'it',
      // 'ja',
      // 'ko',
      // 'ms',
      // 'nl',
      // 'no',
      // 'pl',
      // 'pt-BR',
      // 'pt',
      // 'ru',
      // 'sk',
      // 'sv',
      // 'th',
      // 'tr',
      // 'uk',
      // 'zh-Hans',
      // 'zh',
    ],
  },
  bootstrap(app: StrapiApp) {
    console.log("🎯 [ADMIN] Admin app bootstrapped");
  },
};