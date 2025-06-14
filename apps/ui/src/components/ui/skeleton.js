"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Skeleton = void 0;
const utils_1 = require("@/lib/utils");
function Skeleton({ className, ...props }) {
    return (<div className={(0, utils_1.cn)("bg-primary/10 animate-pulse rounded-md", className)} {...props}/>);
}
exports.Skeleton = Skeleton;
