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
exports.ErrorBoundary = void 0;
const react_1 = require("react");
const react_icons_1 = require("@radix-ui/react-icons");
const Sentry = __importStar(require("@sentry/nextjs"));
const lucide_react_1 = require("lucide-react");
const next_intl_1 = require("next-intl");
const react_error_boundary_1 = require("react-error-boundary");
const general_helpers_1 = require("@/lib/general-helpers");
const alert_1 = require("@/components/ui/alert");
const button_1 = require("@/components/ui/button");
function ErrorBoundaryFallback({ error, resetErrorBoundary, customErrorTitle, hideReset, showErrorMessage, }) {
    const [hidden, setHidden] = (0, react_1.useState)(false);
    const t = (0, next_intl_1.useTranslations)("errors.global");
    if (hidden) {
        return null;
    }
    const handleTryAgain = () => {
        // Attempt to recover by trying to re-render the segment
        resetErrorBoundary();
    };
    const isDev = (0, general_helpers_1.isDevelopment)();
    return (<alert_1.Alert variant="destructive" className="relative">
      <react_icons_1.ExclamationTriangleIcon className="s-4"/>
      <alert_1.AlertTitle>{customErrorTitle ?? t("invalidContent")}</alert_1.AlertTitle>
      <alert_1.AlertDescription>
        {(showErrorMessage || isDev) && (<p className="mt-1 text-sm text-black">{error.message}</p>)}

        {isDev && (<div className="mt-2 w-full overflow-x-auto bg-gray-100 p-3 text-xs">
            <pre>{error.stack?.split("\n").slice(0, 5).join("\n")}</pre>
          </div>)}

        {!hideReset && (<button_1.Button type="button" size="sm" variant="destructive" onClick={handleTryAgain} className="mt-2">
            {t("tryAgain")}
          </button_1.Button>)}
      </alert_1.AlertDescription>

      <span className="absolute top-2 right-2 block">
        <lucide_react_1.XIcon className="size-4 cursor-pointer" onClick={() => setHidden(true)}/>
      </span>
    </alert_1.Alert>);
}
function ErrorBoundary({ children, hideReset, hideFallback, customErrorTitle, showErrorMessage, onReset, onError, }) {
    const handleError = (error, info) => {
        if (onError) {
            onError(error, info);
        }
        Sentry.captureException(error);
    };
    return (<react_error_boundary_1.ErrorBoundary fallbackRender={(props) => hideFallback ? null : (<ErrorBoundaryFallback {...props} hideReset={hideReset} customErrorTitle={customErrorTitle} showErrorMessage={showErrorMessage}/>)} onError={handleError} onReset={onReset}>
      {children}
    </react_error_boundary_1.ErrorBoundary>);
}
exports.ErrorBoundary = ErrorBoundary;
