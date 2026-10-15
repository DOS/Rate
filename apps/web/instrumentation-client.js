"use strict";
// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRouterTransitionStart = void 0;
const env_mjs_1 = require("@/env.mjs");
const Sentry = __importStar(require("@sentry/nextjs"));
Sentry.init({
    dsn: env_mjs_1.env.NEXT_PUBLIC_SENTRY_DSN,
    // Add optional integrations for additional features
    integrations: [
        Sentry.replayIntegration({
            // Additional SDK configuration goes in here, for example:
            maskAllText: true,
            blockAllMedia: true,
        }),
    ],
    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 0.3,
    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 0%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0,
    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,
    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,
});
// Required for Next.js navigation instrumentation
exports.onRouterTransitionStart = Sentry.captureRouterTransitionStart;
