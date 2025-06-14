"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_layout_1 = require("@/components/auth-layout");
async function RootLayout({ children }) {
    return <auth_layout_1.AuthLayout>{children}</auth_layout_1.AuthLayout>;
}
exports.default = RootLayout;
