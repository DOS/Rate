"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fontRoboto = void 0;
const google_1 = require("next/font/google");
exports.fontRoboto = (0, google_1.Roboto)({
    subsets: ["latin"],
    weight: ["100", "300", "400", "500", "700"],
    variable: "--font-roboto",
});
