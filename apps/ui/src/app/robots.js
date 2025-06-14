"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_mjs_1 = require("@/env.mjs");
const general_helpers_1 = require("@/lib/general-helpers");
const baseUrl = env_mjs_1.env.APP_PUBLIC_URL;
function robots() {
    return (0, general_helpers_1.isProduction)()
        ? {
            rules: {
                userAgent: "*",
                allow: "/",
            },
            sitemap: new URL("sitemap.xml", baseUrl).toString(),
        }
        : {
            rules: {
                userAgent: "*",
                disallow: "/",
            },
        };
}
exports.default = robots;
