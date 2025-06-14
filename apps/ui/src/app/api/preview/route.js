"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = void 0;
/* eslint-disable no-console */
const headers_1 = require("next/headers");
const env_mjs_1 = require("@/env.mjs");
const shared_data_1 = require("@repo/shared-data");
const navigation_1 = require("@/lib/navigation");
async function GET(request) {
    if (!env_mjs_1.env.STRAPI_PREVIEW_SECRET) {
        console.log("[STRAPI_PREVIEW]: Preview request received, but [STRAPI_PREVIEW_SECRET] has not been configured. Status: 404.");
        return new Response("Invalid Configuration", { status: 404 });
    }
    const { searchParams } = new URL(request.url);
    // Check if the provided secret matches our secret key
    const secret = String(searchParams.get("secret"));
    if (secret !== env_mjs_1.env.STRAPI_PREVIEW_SECRET) {
        console.log("[STRAPI_PREVIEW]: Preview request received, but [secret] does not match [STRAPI_PREVIEW_SECRET]. Status: 401.");
        return new Response("Invalid token", { status: 401 });
    }
    // Validate the URL begins with ROOT_PAGE_PATH (e.g. index, with optional / for nested pages)
    const urlParam = String(searchParams.get("url"));
    const url = urlParam.match(validPageUrlRegex) ? urlParam : undefined;
    if (!url) {
        return new Response("Invalid URL", { status: 404 });
    }
    // Check if the status in the request is configured correctly
    const statusParam = String(searchParams.get("status"));
    const status = validPageStatusKeys.includes(statusParam)
        ? statusParam
        : "published";
    const dm = await (0, headers_1.draftMode)();
    if (status === "published") {
        dm.disable();
    }
    else {
        /**
         * This works by setting the `__prerender_bypass` response cookie, which is then used to display drafts
         * This has a shortcoming when working with iframe embeddings (such as Strapi preview), where the cookie is being set from a different origin
         * and therefore fails, so Strapi always displays the published version, because draftMode().isEnabled returns `false`
         */
        dm.enable();
    }
    // ------ This code is a workaround for the aforementioned issue ------
    const cookieStore = await (0, headers_1.cookies)();
    const draftCookie = cookieStore.get(draftModePrerenderCookieKey);
    // If we have the cookie, update it with cross-origin iframe support
    // NOTE: You cannot use any other cookie method other than .set() (such as .delete()), because
    // they automatically assume the sameSite=Lax strategy, which will not work with iframes
    cookieStore.set({
        name: draftModePrerenderCookieKey,
        value: draftCookie?.value || "",
        expires: draftCookie?.value ? undefined : 0, // undefined => does not expire, 0 => expires at timestamp 0
        httpOnly: true,
        path: "/",
        secure: true,
        sameSite: "none", // Allow cookie in cross-origin iframes
    });
    // --------------------------------------------------------------------
    // Check if the locale in the request is a correct frontend locale
    const localeParam = String(searchParams.get("locale"));
    const locale = navigation_1.routing.locales.includes(localeParam)
        ? localeParam
        : navigation_1.routing.defaultLocale;
    console.log(`[STRAPI_PREVIEW]: Preview request generated. ${JSON.stringify({
        locale,
        url: {
            urlParam,
            processedUrl: `${url}`,
        },
        status,
    })}`);
    // Redirect to the path from the fetched post
    (0, navigation_1.redirect)({ href: `${url}`, locale });
}
exports.GET = GET;
const validPageStatusKeys = ["draft", "published"];
const draftModePrerenderCookieKey = "__prerender_bypass";
const validPageUrlRegex = new RegExp(String.raw `^(${shared_data_1.ROOT_PAGE_PATH}[a-zA-Z0-9-%]*)+$`, "g");
