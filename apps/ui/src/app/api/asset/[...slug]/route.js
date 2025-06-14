"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = exports.revalidate = void 0;
const env_mjs_1 = require("@/env.mjs");
/**
 * This route handler allows asset fetching from Strapi backend even from client-side components,
 * that cannot know the URL of Strapi.
 *
 * Using AWS S3 or similar bucket will provide you with absolute path for the resource, however
 * Strapi might be used with local storage too. This means, that URLs from assets are being fetched with relative paths.
 *
 * @param request fetch request
 * @param anonymous query parameters of the request
 */
exports.revalidate = false;
async function handler(request, { params }) {
    const { slug } = await params;
    const path = Array.isArray(slug) ? slug.join("/") : slug;
    const url = `${env_mjs_1.env.STRAPI_URL}/${path}`;
    const clonedRequest = request.clone();
    // eslint-disable-next-line no-unused-vars
    const { url: _, ...rest } = clonedRequest;
    const response = await fetch(url, {
        ...rest,
    });
    return response;
}
exports.GET = handler;
