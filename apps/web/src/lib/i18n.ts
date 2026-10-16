import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './navigation';

export default getRequestConfig(async ({ requestLocale }) => {
  // Resolved by next-intl middleware from NEXT_LOCALE cookie (localePrefix: "never")
  let locale = await requestLocale;

  const supportedLocales: readonly string[] = routing.locales;
  if (!locale || !supportedLocales.includes(locale)) {
    try {
      const cookieStore = await cookies();
      const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
      if (cookieLocale && supportedLocales.includes(cookieLocale)) {
        locale = cookieLocale;
      }
    } catch {
      // Static generation fallback
    }
  }

  // Ensure that a valid locale is used
  if (!locale || !supportedLocales.includes(locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (
      await (locale === 'vi'
        ? import('../../locales/vi.json')
        : locale === 'en'
          ? import('../../locales/en.json')
          : import(`../../locales/${locale}.json`))
    ).default,
    timeZone: 'Asia/Ho_Chi_Minh',
  };
});
