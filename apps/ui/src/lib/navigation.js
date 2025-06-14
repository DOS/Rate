"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatHref = exports.isAppLink = exports.getAppPublicUrl = exports.redirect = exports.useRouter = exports.usePathname = exports._redirect = exports.Link = exports.routing = void 0;
const env_mjs_1 = require("@/env.mjs");
const navigation_1 = require("next-intl/navigation");
const routing_1 = require("next-intl/routing");
exports.routing = (0, routing_1.defineRouting)({
    // A list of all locales that are supported
    locales: ["cs", "en", "vi"],
    // Used when no locale matches
    defaultLocale: "en",
    localePrefix: "as-needed",
});
// https://next-intl-docs.vercel.app/docs/routing/navigation
_a = (0, navigation_1.createNavigation)(exports.routing), exports.Link = _a.Link, exports._redirect = _a.redirect, exports.usePathname = _a.usePathname, exports.useRouter = _a.useRouter;
// Help TypeScript detect unreachable code
// https://next-intl-docs.vercel.app/docs/routing/navigation#redirect
exports.redirect = exports._redirect;
const getAppPublicUrl = () => {
    // Determine the base URL: use APP_PUBLIC_URL on the server or window.location.origin on the client
    const baseUrl = typeof window === "undefined" ? env_mjs_1.env.APP_PUBLIC_URL : window.location.origin;
    return baseUrl;
};
exports.getAppPublicUrl = getAppPublicUrl;
const isAppLink = (link) => {
    try {
        const baseUrl = (0, exports.getAppPublicUrl)();
        if (!baseUrl) {
            throw new Error("Base URL is not defined.");
        }
        const url = new URL(link, baseUrl);
        return url.hostname === new URL(baseUrl).hostname;
    }
    catch (error) {
        return false;
    }
};
exports.isAppLink = isAppLink;
const formatHref = (href) => {
    if (!href || href === "#") {
        // Empty path -> return hash to prevent unwanted issues
        return "#";
    }
    if (href.startsWith("http")) {
        // External or internal link that starts with http(s) -> return as is
        return href;
    }
    if (!(0, exports.isAppLink)(href)) {
        // External link -> return as is
        return href;
    }
    if (!href.startsWith("/")) {
        // Ensure path starts with a slash
        href = `/${href}`;
    }
    return href;
};
exports.formatHref = formatHref;
