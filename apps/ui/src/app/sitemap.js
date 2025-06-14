"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_mjs_1 = require("@/env.mjs");
const shared_data_1 = require("@repo/shared-data");
const general_helpers_1 = require("@/lib/general-helpers");
const navigation_1 = require("@/lib/navigation");
const strapi_api_1 = require("@/lib/strapi-api");
// The URL should be absolute, including the baseUrl (e.g. http://localhost:3000/some/nested-page)
const baseUrl = env_mjs_1.env.APP_PUBLIC_URL;
/**
 * Note: We could use generateSitemaps to separate the sitemaps, however that does not create the root sitemap.
 */
async function sitemap() {
    if (!(0, general_helpers_1.isProduction)()) {
        return [];
    }
    const promises = navigation_1.routing.locales.map((locale) => generateLocalizedSitemap(locale));
    const results = await Promise.allSettled(promises);
    return results
        .filter((result) => result.status === "fulfilled")
        .reduce((acc, curr) => {
        acc.push(...curr.value);
        return acc;
    }, []);
}
exports.default = sitemap;
/**
 * Fetches all entries in a given collection - by default this is api::page.page
 * and generates sitemap entries for a single locale
 * @param locale locale to retrieve (must be defined in routing `@/lib/navigation`)
 * @returns Sitemap entries for a single locale
 */
async function generateLocalizedSitemap(locale) {
    let pageEntities = {};
    // Fetch all records for each entity individually
    for (const entityUid of pageEntityUids) {
        const entityResponse = await fetchAllEntityRecords(entityUid, locale);
        if (entityResponse.data.length > 0) {
            pageEntities[entityUid] = entityResponse.data;
        }
    }
    /**
     * iterate over all pageable collections, and push each entry into the sitemap array,
     * alongside mapping of changeFrequency
     */
    return Object.entries(pageEntities).reduce((acc, [uid, pages]) => {
        pages.forEach((page) => {
            if (page.fullPath) {
                acc.push({
                    url: generateSitemapEntryUrl(page.fullPath, String(page.locale)),
                    lastModified: page.updatedAt ?? page.createdAt ?? undefined,
                    changeFrequency: entityChangeFrequency[uid] ?? "monthly",
                });
            }
        });
        return acc;
    }, []);
}
const generateSitemapEntryUrl = (fullPath, locale) => {
    const isDefaultLocale = locale === navigation_1.routing.defaultLocale;
    let url;
    if (fullPath === shared_data_1.ROOT_PAGE_PATH) {
        // If this is the default locale, return baseAppUrl
        // otherwise return the localized landing page
        url = isDefaultLocale ? baseUrl : new URL(locale, baseUrl);
    }
    else {
        url = new URL([isDefaultLocale ? null : ["/", locale], fullPath]
            .flat()
            .filter(Boolean)
            .join(""), baseUrl);
    }
    return url.toString();
};
// Should you have multiple "pageable" collections, add them to this array
const pageEntityUids = ["api::page.page"];
const fetchAllEntityRecords = (entityUid, locale) => strapi_api_1.PublicStrapiClient.fetchAll(entityUid, {
    locale,
    fields: ["fullPath", "locale", "updatedAt", "createdAt"],
    populate: {},
    status: "published",
});
/**
 * Object that determines default changeFrequency attribute for crawlers.
 * For example, pages may change once a month or year, whereas blog articles could update weekly
 */
const entityChangeFrequency = {
    "api::page.page": "monthly",
};
