"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Container = void 0;
const clsx_1 = __importDefault(require("clsx"));
function Container({ className, ...props }) {
    return (<div className={(0, clsx_1.default)('mx-auto max-w-7xl px-4 sm:px-6 lg:px-8', className)} {...props}/>);
}
exports.Container = Container;
