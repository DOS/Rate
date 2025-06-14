"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const google_1 = require("next/font/google");
const clsx_1 = __importDefault(require("clsx"));
require("@/styles/tailwind.css");
exports.metadata = {
    title: {
        template: '%s - TaxPal',
        default: 'TaxPal - Accounting made simple for small businesses',
    },
    description: 'Most bookkeeping software is accurate, but hard to use. We make the opposite trade-off, and hope you don’t get audited.',
};
const inter = (0, google_1.Inter)({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-inter',
});
const lexend = (0, google_1.Lexend)({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-lexend',
});
function RootLayout({ children, }) {
    return (<html lang="en" className={(0, clsx_1.default)('h-full scroll-smooth bg-white antialiased', inter.variable, lexend.variable)}>
      <body className="flex h-full flex-col">{children}</body>
    </html>);
}
exports.default = RootLayout;
