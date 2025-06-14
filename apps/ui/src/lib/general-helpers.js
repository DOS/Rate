"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeJSONParse = exports.removeThisWhenYouNeedMe = exports.setupLibraries = exports.isDevelopment = exports.isTesting = exports.isProduction = void 0;
const env_mjs_1 = require("@/env.mjs");
const dates_1 = require("./dates");
const isProduction = () => env_mjs_1.env.APP_ENV === "production";
exports.isProduction = isProduction;
const isTesting = () => env_mjs_1.env.APP_ENV === "testing";
exports.isTesting = isTesting;
const isDevelopment = () => env_mjs_1.env.NODE_ENV === "development";
exports.isDevelopment = isDevelopment;
const setupLibraries = () => {
    (0, dates_1.setupDayJs)();
};
exports.setupLibraries = setupLibraries;
const removeThisWhenYouNeedMe = (functionName) => {
    if (!(0, exports.isDevelopment)() || env_mjs_1.env.NEXT_PUBLIC_PREVENT_UNUSED_FUNCTIONS_ERROR_LOGS) {
        return;
    }
    console.warn(`TODO: Delete 'removeThisWhenYouNeedMe' call from '${functionName}' and confirm the usage.`);
};
exports.removeThisWhenYouNeedMe = removeThisWhenYouNeedMe;
const safeJSONParse = (json) => {
    try {
        return JSON.parse(json);
    }
    catch (e) {
        console.error("Error parsing JSON", e);
        return {};
    }
};
exports.safeJSONParse = safeJSONParse;
