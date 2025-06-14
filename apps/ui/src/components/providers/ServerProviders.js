"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerProviders = void 0;
const react_1 = __importDefault(require("react"));
const next_intl_1 = require("next-intl");
const server_1 = require("next-intl/server");
const general_helpers_1 = require("@/lib/general-helpers");
// Setup libraries in server environment
(0, general_helpers_1.setupLibraries)();
async function ServerProviders({ children, params }) {
    const { locale } = await params;
    const messages = await (0, server_1.getMessages)();
    return (<next_intl_1.NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </next_intl_1.NextIntlClientProvider>);
}
exports.ServerProviders = ServerProviders;
