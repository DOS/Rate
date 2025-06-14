"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPage = void 0;
const headers_1 = require("next/headers");
const strapi_api_1 = require("@/lib/strapi-api");
async function fetchPage(fullPath, locale) {
    // eslint-disable-next-line no-console
    console.log({ message: `Fetching page: ${locale} - ${fullPath}` });
    const dm = await (0, headers_1.draftMode)();
    try {
        return await strapi_api_1.PublicStrapiClient.fetchOneByFullPath("api::page.page", fullPath, {
            locale,
            status: dm.isEnabled ? "draft" : "published",
            populate: {
                content: true,
                seo: true,
            },
            // Use with BIG caution, this can lead to a lot of data being fetched
            deepLevel: 6,
            // Ignore these fields when deep populating
            deepLevelIgnore: ["children", "parent", "localizations", "seo"],
        });
    }
    catch (e) {
        console.error({
            message: `Error fetching page: ${locale} - ${fullPath}`,
            data: JSON.stringify({
                error: e?.message,
                stack: e?.stack,
            }),
        });
    }
}
exports.fetchPage = fetchPage;
