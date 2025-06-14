"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultTwitterMeta = exports.getDefaultOgMeta = exports.getDefaultMetadata = void 0;
const navigation_1 = require("@/lib/navigation");
function getDefaultMetadata(customMetadata, siteUrl, t) {
    return {
        title: t("metaTitle"),
        description: t("metaDescription"),
        keywords: t("keywords"),
        robots: t("metaRobots"),
        applicationName: t("applicationName"),
        icons: {
            icon: "favicon.ico",
        },
        alternates: {
            canonical: siteUrl,
            languages: navigation_1.routing.locales.reduce((acc, locale) => {
                acc[locale] = `${siteUrl}/${locale}`;
                return acc;
            }, {}),
        },
        metadataBase: new URL(siteUrl),
        ...customMetadata,
    };
}
exports.getDefaultMetadata = getDefaultMetadata;
function getDefaultOgMeta(locale, fullPath, t) {
    return {
        type: "website",
        locale: locale,
        siteName: t("siteName"),
        title: t("metaTitle"),
        description: t("metaDescription"),
        emails: [t("email")],
        images: [t("metaImageUrl")],
        url: `/${locale}${fullPath ?? ""}`,
    };
}
exports.getDefaultOgMeta = getDefaultOgMeta;
function getDefaultTwitterMeta(t) {
    return {
        card: t("twitter.card"),
        title: t("twitter.title"),
        description: t("twitter.description"),
        siteId: t("twitter.siteId"),
        creator: t("twitter.creator"),
        creatorId: t("twitter.creatorId"),
        images: [t("twitter.imageUrl")],
    };
}
exports.getDefaultTwitterMeta = getDefaultTwitterMeta;
