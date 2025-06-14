"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const env_mjs_1 = require("@/env.mjs");
const crypto_1 = require("@/lib/crypto");
const StrapiPreviewListener_1 = __importDefault(require("./StrapiPreviewListener"));
const STRAPI_PREVIEW_ENABLED = Boolean(env_mjs_1.env.STRAPI_PREVIEW_SECRET);
const StrapiPreviewListener = async () => {
    const strapiPreviewHashedOrigin = STRAPI_PREVIEW_ENABLED
        ? await (0, crypto_1.hashStringSHA256)(env_mjs_1.env.STRAPI_URL)
        : undefined;
    if (!STRAPI_PREVIEW_ENABLED || !strapiPreviewHashedOrigin) {
        return null;
    }
    return (<StrapiPreviewListener_1.default hashedAllowedReloadOrigin={strapiPreviewHashedOrigin}/>);
};
exports.default = StrapiPreviewListener;
