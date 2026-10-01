import { getRequestConfig } from "next-intl/server"

import { routing } from "./navigation"

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale

  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    messages: (
      await (locale === "vi"
        ? import("../../locales/vi.json")
        : locale === "en"
        ? import("../../locales/en.json")
        : import(`../../locales/${locale}.json`))
    ).default,
    timeZone: "Asia/Ho_Chi_Minh",
  }
})
