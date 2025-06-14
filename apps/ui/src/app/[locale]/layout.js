"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = exports.generateStaticParams = void 0;
require("@/styles/globals.css");
const navigation_1 = require("next/navigation");
const server_1 = require("next-intl/server");
const fonts_1 = require("@/lib/fonts");
const navigation_2 = require("@/lib/navigation");
const utils_1 = require("@/lib/utils");
const ErrorBoundary_1 = require("@/components/elementary/ErrorBoundary");
const StrapiPreviewListener_1 = __importDefault(require("@/components/elementary/StrapiPreviewListener"));
const TailwindIndicator_1 = require("@/components/elementary/TailwindIndicator");
const StrapiFooter_1 = __importDefault(require("@/components/page-builder/single-types/footer/StrapiFooter"));
const StrapiNavbar_1 = __importDefault(require("@/components/page-builder/single-types/navbar/StrapiNavbar"));
const ClientProviders_1 = require("@/components/providers/ClientProviders");
const ServerProviders_1 = require("@/components/providers/ServerProviders");
const TrackingScripts_1 = __importDefault(require("@/components/providers/TrackingScripts"));
const toaster_1 = require("@/components/ui/toaster");
function generateStaticParams() {
    return navigation_2.routing.locales.map((locale) => ({ locale }));
}
exports.generateStaticParams = generateStaticParams;
exports.metadata = {
    title: {
        template: "%s / Notum Technologies",
        default: "",
    },
};
async function RootLayout({ children, params }) {
    const { locale } = await params;
    if (!navigation_2.routing.locales.includes(locale)) {
        (0, navigation_1.notFound)();
    }
    // Enable static rendering
    // https://next-intl-docs.vercel.app/docs/getting-started/app-router/with-i18n-routing#static-rendering
    (0, server_1.setRequestLocale)(locale);
    return (<html lang={locale} suppressHydrationWarning>
      <head />
      <body className={(0, utils_1.cn)("bg-background min-h-screen font-sans antialiased", fonts_1.fontRoboto.variable)}>
        <StrapiPreviewListener_1.default />
        <TrackingScripts_1.default />
        <ServerProviders_1.ServerProviders params={params}>
          <ClientProviders_1.ClientProviders>
            <div className="relative flex min-h-screen flex-col">
              <ErrorBoundary_1.ErrorBoundary hideFallback>
                <StrapiNavbar_1.default locale={locale}/>
              </ErrorBoundary_1.ErrorBoundary>

              <div className="flex-1">
                <div>{children}</div>
              </div>

              <TailwindIndicator_1.TailwindIndicator />

              <toaster_1.Toaster />

              <ErrorBoundary_1.ErrorBoundary hideFallback>
                <StrapiFooter_1.default locale={locale}/>
              </ErrorBoundary_1.ErrorBoundary>
            </div>
          </ClientProviders_1.ClientProviders>
        </ServerProviders_1.ServerProviders>
      </body>
    </html>);
}
exports.default = RootLayout;
