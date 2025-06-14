"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicClient = void 0;
const env_mjs_1 = require("@/env.mjs");
const qs_1 = __importDefault(require("qs"));
const base_1 = __importDefault(require("@/lib/strapi-api/base"));
class PublicClient extends base_1.default {
    async prepareRequest(path, params) {
        let url = `/api${path.startsWith("/") ? path : `/${path}`}`;
        const queryString = typeof params === "object" ? qs_1.default.stringify(params) : params;
        if (queryString != null && queryString?.length > 0) {
            url += `?${queryString}`;
        }
        let completeUrl = `/api/public-proxy${url}`;
        if (typeof window === "undefined") {
            // SSR components do not support relative URLs, so we have to prefix it with local app URL
            completeUrl = `${env_mjs_1.env.APP_PUBLIC_URL}${completeUrl}`;
        }
        return {
            url: completeUrl,
            headers: {
                Accept: "application/json",
                "Content-type": "application/json",
            },
        };
    }
}
exports.PublicClient = PublicClient;
