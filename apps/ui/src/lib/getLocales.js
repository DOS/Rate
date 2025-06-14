"use strict";
/**
 * Fetch available locales from Strapi API
 * This is a better approach than hardcoding locales
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamicRouting = exports.getLocalesFromStrapi = void 0;
async function getLocalesFromStrapi() {
    try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_STRAPI_URL}/api/i18n/locales`);
        const data = await response.json();
        // Transform Strapi locales to app format
        return data.map((locale) => ({
            code: locale.code,
            name: locale.name,
            isDefault: locale.isDefault,
        }));
    }
    catch (error) {
        console.error("Failed to fetch locales from Strapi:", error);
        // Fallback to hardcoded locales
        return [
            { code: "en", name: "English", isDefault: true },
            { code: "cs", name: "Czech", isDefault: false },
            { code: "vi", name: "Vietnamese", isDefault: false },
        ];
    }
}
exports.getLocalesFromStrapi = getLocalesFromStrapi;
// Dynamic locale configuration (for future use)
const dynamicRouting = async () => {
    const locales = await getLocalesFromStrapi();
    const defaultLocale = locales.find((l) => l.isDefault)?.code || "en";
    return {
        locales: locales.map((l) => l.code),
        defaultLocale,
        localePrefix: "as-needed",
    };
};
exports.dynamicRouting = dynamicRouting;
