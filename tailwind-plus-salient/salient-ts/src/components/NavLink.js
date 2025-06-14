"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NavLink = void 0;
const link_1 = __importDefault(require("next/link"));
function NavLink({ href, children, }) {
    return (<link_1.default href={href} className="inline-block rounded-lg px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900">
      {children}
    </link_1.default>);
}
exports.NavLink = NavLink;
