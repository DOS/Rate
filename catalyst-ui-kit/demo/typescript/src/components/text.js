"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Code = exports.Strong = exports.TextLink = exports.Text = void 0;
const clsx_1 = __importDefault(require("clsx"));
const link_1 = require("./link");
function Text({ className, ...props }) {
    return (<p data-slot="text" {...props} className={(0, clsx_1.default)(className, 'text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400')}/>);
}
exports.Text = Text;
function TextLink({ className, ...props }) {
    return (<link_1.Link {...props} className={(0, clsx_1.default)(className, 'text-zinc-950 underline decoration-zinc-950/50 data-hover:decoration-zinc-950 dark:text-white dark:decoration-white/50 dark:data-hover:decoration-white')}/>);
}
exports.TextLink = TextLink;
function Strong({ className, ...props }) {
    return <strong {...props} className={(0, clsx_1.default)(className, 'font-medium text-zinc-950 dark:text-white')}/>;
}
exports.Strong = Strong;
function Code({ className, ...props }) {
    return (<code {...props} className={(0, clsx_1.default)(className, 'rounded-sm border border-zinc-950/10 bg-zinc-950/2.5 px-0.5 text-sm font-medium text-zinc-950 sm:text-[0.8125rem] dark:border-white/20 dark:bg-white/5 dark:text-white')}/>);
}
exports.Code = Code;
