"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Spinner = void 0;
const utils_1 = require("@/lib/utils");
function Spinner({ className = "", borderColorClass = "border-white", borderWidthClass = "border", }) {
    return (<span className={(0, utils_1.cn)("box-border inline-block min-h-2 min-w-2 animate-spin rounded-full border-solid border-b-transparent", borderWidthClass, borderColorClass, className)}/>);
}
exports.Spinner = Spinner;
