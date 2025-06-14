"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const data_1 = require("@/data");
const application_layout_1 = require("./application-layout");
async function RootLayout({ children }) {
    let events = await (0, data_1.getEvents)();
    return <application_layout_1.ApplicationLayout events={events}>{children}</application_layout_1.ApplicationLayout>;
}
exports.default = RootLayout;
