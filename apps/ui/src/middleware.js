"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const server_1 = require("next/server");
const middleware_1 = require("next-auth/middleware");
const middleware_2 = __importDefault(require("next-intl/middleware"));
const general_helpers_1 = require("./lib/general-helpers");
const navigation_1 = require("./lib/navigation");
// https://next-intl-docs.vercel.app/docs/getting-started/app-router
const intlMiddleware = (0, middleware_2.default)(navigation_1.routing);
// List all pages that require authentication (non-public)
const authPages = ["/auth/change-password", "/auth/signout"];
const authMiddleware = (0, middleware_1.withAuth)(
// Note that this callback is only invoked if
// the `authorized` callback has returned `true`
// and not for pages listed in `pages`.
(req) => intlMiddleware(req), {
    callbacks: {
        authorized: ({ token }) => token != null,
    },
    pages: {
        signIn: "/auth/signin",
    },
});
function middleware(req) {
    // Handle HTTPS redirection in production in Heroku servers
    // Comment this block when running locally (using `next start`)
    const xForwardedProtoHeader = req.headers.get("x-forwarded-proto");
    if (!(0, general_helpers_1.isDevelopment)() &&
        (xForwardedProtoHeader === null ||
            xForwardedProtoHeader.includes("https") === false)) {
        return server_1.NextResponse.redirect(`https://${req.headers.get("host")}${req.nextUrl.pathname}`, 301);
    }
    // Build regex for auth (non-public) pages
    const authPathnameRegex = RegExp(`^(/(${navigation_1.routing.locales.join("|")}))?(${authPages.join("|")})/?$`, "i");
    const isAuthPage = authPathnameRegex.test(req.nextUrl.pathname);
    // If the request is for a non-public (auth) page, require authentication
    if (isAuthPage) {
        return authMiddleware(req);
    }
    // All other pages are public
    return intlMiddleware(req);
}
exports.default = middleware;
exports.config = {
    // Match only internationalized pathnames
    matcher: [
        // Enable a redirect to a matching locale at the root
        "/",
        // Set a cookie to remember the previous locale for
        // all requests that have a locale prefix
        `/(cs|en|vi)/:path*`,
        // Skip all paths that should not be internationalized
        "/((?!_next|_vercel|api|robots.txt|favicon.ico|sitemap|.*\\..*).*)",
    ],
};
