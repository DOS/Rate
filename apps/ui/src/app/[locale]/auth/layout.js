"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("next-intl/server");
async function AuthLayout({ children, params }) {
    const { locale } = await params;
    (0, server_1.setRequestLocale)(locale);
    return (<section className="container grid items-center gap-6 pt-6 pb-8 md:py-10">
      {children}
    </section>);
}
exports.default = AuthLayout;
