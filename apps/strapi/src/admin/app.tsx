import { StrapiApp } from '@strapi/strapi/admin';
import { unstable_useContentManagerContext as useContentManagerContext } from '@strapi/strapi/admin';
import ItemCategoryHandler from './extensions/item-category-handler';

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
