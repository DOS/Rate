"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivateClient = void 0;
const env_mjs_1 = require("@/env.mjs");
const react_1 = require("next-auth/react");
const qs_1 = __importDefault(require("qs"));
const auth_1 = require("@/lib/auth");
const base_1 = __importDefault(require("@/lib/strapi-api/base"));
class PrivateClient extends base_1.default {
    async prepareRequest(path, params, options) {
        let url = `/api${path.startsWith("/") ? path : `/${path}`}`;
        const queryString = typeof params === "object" ? qs_1.default.stringify(params) : params;
        if (queryString != null && queryString?.length > 0) {
            url += `?${queryString}`;
        }
        let completeUrl = `/api/private-proxy${url}`;
        if (typeof window === "undefined") {
            // SSR components do not support relative URLs, so we have to prefix it with local app URL
            completeUrl = `${env_mjs_1.env.APP_PUBLIC_URL}${completeUrl}`;
        }
        const token = options?.omitUserAuthorization
            ? undefined
            : options?.userJWT || (await this.getStrapiUserTokenFromNextAuth());
        return {
            url: completeUrl,
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        };
    }
    /**
     * Get user-permission token from the NextAuth session
     * @returns strapiToken
     */
    async getStrapiUserTokenFromNextAuth() {
        const isRSC = typeof window === "undefined";
        if (isRSC) {
            // server side
            const session = await (0, auth_1.getAuth)();
            return session?.strapiJWT;
        }
        // client side
        // this makes HTTP request to /api/auth/session to get the session
        // this is not the best solution because it makes HTTP request to the server
        // but useSession() can't be used here
        const session = await (0, react_1.getSession)();
        return session?.strapiJWT;
    }
}
exports.PrivateClient = PrivateClient;
