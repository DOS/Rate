"use client";
"use strict";
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
// Error boundaries must be Client Components - https://nextjs.org/docs/14/app/building-your-application/routing/error-handling
const react_1 = require("react");
const Sentry = __importStar(require("@sentry/nextjs"));
const next_intl_1 = require("next-intl");
const general_helpers_1 = require("@/lib/general-helpers");
const button_1 = require("@/components/ui/button");
function Error({ error, reset }) {
    const t = (0, next_intl_1.useTranslations)("errors.global");
    (0, react_1.useEffect)(() => {
        Sentry.captureException(error);
    }, [error]);
    const handleTryAgain = () => {
        // Attempt to recover by trying to re-render the segment
        reset();
    };
    const isDev = (0, general_helpers_1.isDevelopment)();
    return (<div className="w-full overflow-x-hidden">
      <h1 className="text-xl font-semibold tracking-tight">
        {t("somethingWentWrong")}
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        {t("invalidContent")}
        {isDev ? `: ${error.message}` : null}
      </p>
      {isDev && (<p className="mt-2 w-full overflow-x-auto bg-gray-100 p-3 text-xs">
          <pre>{error.stack?.split("\n").slice(0, 7).join("\n")}</pre>
        </p>)}

      <button_1.Button type="button" size="sm" onClick={handleTryAgain} className="mt-2">
        {t("tryAgain")}
      </button_1.Button>
    </div>);
}
exports.default = Error;
