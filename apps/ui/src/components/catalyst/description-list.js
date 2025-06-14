"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DescriptionDetails = exports.DescriptionTerm = exports.DescriptionList = void 0;
const clsx_1 = __importDefault(require("clsx"));
function DescriptionList({ className, ...props }) {
    return (<dl {...props} className={(0, clsx_1.default)(className, 'grid grid-cols-1 text-base/6 sm:grid-cols-[min(50%,--spacing(80))_auto] sm:text-sm/6')}/>);
}
exports.DescriptionList = DescriptionList;
function DescriptionTerm({ className, ...props }) {
    return (<dt {...props} className={(0, clsx_1.default)(className, 'col-start-1 border-t border-zinc-950/5 pt-3 text-zinc-500 first:border-none sm:border-t sm:border-zinc-950/5 sm:py-3 dark:border-white/5 dark:text-zinc-400 sm:dark:border-white/5')}/>);
}
exports.DescriptionTerm = DescriptionTerm;
function DescriptionDetails({ className, ...props }) {
    return (<dd {...props} className={(0, clsx_1.default)(className, 'pt-1 pb-3 text-zinc-950 sm:border-t sm:border-zinc-950/5 sm:py-3 sm:nth-2:border-none dark:text-white dark:sm:border-white/5')}/>);
}
exports.DescriptionDetails = DescriptionDetails;
