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
exports.ClientProviders = void 0;
const react_1 = __importStar(require("react"));
const react_query_1 = require("@tanstack/react-query");
const react_2 = require("next-auth/react");
const next_themes_1 = require("next-themes");
const zod_1 = require("zod");
const general_helpers_1 = require("@/lib/general-helpers");
const useTranslatedZod_1 = require("@/hooks/useTranslatedZod");
// Setup libraries in client environment
(0, general_helpers_1.setupLibraries)();
const queryClient = new react_query_1.QueryClient();
function ClientProviders({ children, }) {
    (0, useTranslatedZod_1.useTranslatedZod)(zod_1.z);
    return (<react_2.SessionProvider>
      <TokenProvider>
        <next_themes_1.ThemeProvider attribute="class" defaultTheme="system" enableSystem forcedTheme="light">
          <react_query_1.QueryClientProvider client={queryClient}>
            {children}
          </react_query_1.QueryClientProvider>
        </next_themes_1.ThemeProvider>
      </TokenProvider>
    </react_2.SessionProvider>);
}
exports.ClientProviders = ClientProviders;
function TokenProvider({ children }) {
    const session = (0, react_2.useSession)();
    (0, react_1.useEffect)(() => {
        if (session.data?.error === "invalid_strapi_token") {
            (0, react_2.signOut)({ callbackUrl: "/auth/signin" });
        }
    }, [session]);
    return <>{children}</>;
}
