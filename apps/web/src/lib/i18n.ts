import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './navigation';

export default getRequestConfig(async ({ requestLocale }) => {
  // Resolved by next-intl middleware from NEXT_LOCALE cookie (localePrefix: "never")
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as any)) {
    try {
      const cookieStore = await cookies();
      const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
      if (cookieLocale && routing.locales.includes(cookieLocale as any)) {
        locale = cookieLocale;
      }
    } catch {
      // Static generation fallback
    }
  }

  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as any)) {
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
