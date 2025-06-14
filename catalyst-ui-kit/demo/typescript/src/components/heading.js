"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Subheading = exports.Heading = void 0;
const clsx_1 = __importDefault(require("clsx"));
function Heading({ className, level = 1, ...props }) {
    let Element = `h${level}`;
    return (<Element {...props} className={(0, clsx_1.default)(className, 'text-2xl/8 font-semibold text-zinc-950 sm:text-xl/8 dark:text-white')}/>);
}
exports.Heading = Heading;
function Subheading({ className, level = 2, ...props }) {
    let Element = `h${level}`;
    return (<Element {...props} className={(0, clsx_1.default)(className, 'text-base/7 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white')}/>);
}
exports.Subheading = Subheading;
