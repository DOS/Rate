"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("next-intl/server");
const navigation_1 = require("./navigation");
exports.default = (0, server_1.getRequestConfig)(async ({ requestLocale }) => {
    // This typically corresponds to the `[locale]` segment
    let locale = await requestLocale;
    // Ensure that a valid locale is used
    if (!locale || !navigation_1.routing.locales.includes(locale)) {
        locale = navigation_1.routing.defaultLocale;
    }
    return {
        locale,
        messages: (await (locale === "en"
            ? // When using Turbopack, this will enable HMR for `en`
                import("../../locales/en.json")
            : import(`../../locales/${locale}.json`))).default,
        timeZone: "Europe/Prague",
    };
});
