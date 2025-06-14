"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Divider = void 0;
const clsx_1 = __importDefault(require("clsx"));
function Divider({ soft = false, className, ...props }) {
    return (<hr role="presentation" {...props} className={(0, clsx_1.default)(className, 'w-full border-t', soft && 'border-zinc-950/5 dark:border-white/5', !soft && 'border-zinc-950/10 dark:border-white/10')}/>);
}
exports.Divider = Divider;
