"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMetadataFromStrapi = void 0;
const env_mjs_1 = require("@/env.mjs");
const lodash_1 = require("lodash");
const server_1 = require("next-intl/server");
const defaults_1 = require("@/lib/metadata/defaults");
const strapi_api_1 = require("@/lib/strapi-api");
async function getMetadataFromStrapi({ fullPath, locale, customMetadata, uid = "api::page.page", }) {
    const t = await (0, server_1.getTranslations)({ locale, namespace: "seo" });
    const siteUrl = env_mjs_1.env.APP_PUBLIC_URL;
    if (!siteUrl) {
        console.error("Please provide APP_PUBLIC_URL (public URL of site) for SEO metadata generation.");
        return null;
    }
    const defaultMeta = (0, defaults_1.getDefaultMetadata)(customMetadata, siteUrl, t);
    const defaultOgMeta = (0, defaults_1.getDefaultOgMeta)(locale, fullPath, t);
    const defaultTwitterMeta = (0, defaults_1.getDefaultTwitterMeta)(t);
    // skip strapi fetching and return SEO from translations
    if (!fullPath) {
        return {
            ...defaultMeta,
            openGraph: defaultOgMeta,
            twitter: defaultTwitterMeta,
        };
    }
    try {
        return await fetchAndMapStrapiMetadata(locale, fullPath, defaultMeta, defaultOgMeta, defaultTwitterMeta, uid);
    }
    catch (e) {
        console.warn(`SEO for ${uid} content type ("${fullPath}") wasn't fetched: `, e?.message);
        return {
            ...defaultMeta,
            openGraph: defaultOgMeta,
            twitter: defaultTwitterMeta,
        };
    }
}
exports.getMetadataFromStrapi = getMetadataFromStrapi;
async function fetchAndMapStrapiMetadata(locale, fullPath, defaultMeta, defaultOgMeta, defaultTwitterMeta, uid = "api::page.page") {
    const res = await strapi_api_1.PublicStrapiClient.fetchOneByFullPath(uid, fullPath, {
        locale,
        populate: {
            seo: {
                populate: {
                    metaImage: true,
                    twitter: { populate: { images: true } },
                },
            },
        },
        fields: [],
    });
    const seo = res.data?.seo;
    const strapiMeta = {
        title: seo?.metaTitle,
        description: seo?.metaDescription,
        keywords: seo?.keywords,
        robots: seo?.metaRobots,
        applicationName: seo?.applicationName,
    };
    const strapiOgMeta = {
        siteName: seo?.siteName ?? undefined,
        title: seo?.metaTitle ?? undefined,
        description: seo?.metaDescription ?? undefined,
        emails: seo?.email ?? undefined,
        images: seo?.metaImage
            ? [
                {
                    url: seo.metaImage.url,
                    width: seo.metaImage.width,
                    height: seo.metaImage.height,
                    alt: seo.metaImage.alternativeText,
                },
            ]
            : undefined,
    };
    const twitterSeo = seo?.twitter;
    const strapiTwitterMeta = twitterSeo
        ? preprocessTwitterMetadata(twitterSeo)
        : undefined;
    return {
        ...(0, lodash_1.mergeWith)(defaultMeta, strapiMeta, seoMergeCustomizer),
        openGraph: (0, lodash_1.mergeWith)(defaultOgMeta, strapiOgMeta, seoMergeCustomizer),
        twitter: (0, lodash_1.mergeWith)(defaultTwitterMeta, strapiTwitterMeta, seoMergeCustomizer),
    };
}
const preprocessTwitterMetadata = (twitterSeo) => {
    const card = ["summary", "summary_large_image", "player", "app"].includes(String(twitterSeo?.card))
        ? String(twitterSeo?.card)
        : "summary";
    return {
        card,
        title: twitterSeo.title ?? undefined,
        description: twitterSeo.description ?? undefined,
        siteId: twitterSeo.siteId ?? undefined,
        creator: twitterSeo.creator ?? undefined,
        creatorId: twitterSeo.creatorId ?? undefined,
        images: twitterSeo.images != null
            ? twitterSeo.images.map((image) => image.url)
            : [],
    };
};
const seoMergeCustomizer = (defaultValue, strapiValue) => strapiValue ?? defaultValue;
