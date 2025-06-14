"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorMessage = exports.Description = exports.Label = exports.Field = exports.FieldGroup = exports.Legend = exports.Fieldset = void 0;
const Headless = __importStar(require("@headlessui/react"));
const clsx_1 = __importDefault(require("clsx"));
function Fieldset({ className, ...props }) {
    return (<Headless.Fieldset {...props} className={(0, clsx_1.default)(className, '*:data-[slot=text]:mt-1 [&>*+[data-slot=control]]:mt-6')}/>);
}
exports.Fieldset = Fieldset;
function Legend({ className, ...props }) {
    return (<Headless.Legend data-slot="legend" {...props} className={(0, clsx_1.default)(className, 'text-base/6 font-semibold text-zinc-950 data-disabled:opacity-50 sm:text-sm/6 dark:text-white')}/>);
}
exports.Legend = Legend;
function FieldGroup({ className, ...props }) {
    return <div data-slot="control" {...props} className={(0, clsx_1.default)(className, 'space-y-8')}/>;
}
exports.FieldGroup = FieldGroup;
function Field({ className, ...props }) {
    return (<Headless.Field {...props} className={(0, clsx_1.default)(className, '[&>[data-slot=label]+[data-slot=control]]:mt-3', '[&>[data-slot=label]+[data-slot=description]]:mt-1', '[&>[data-slot=description]+[data-slot=control]]:mt-3', '[&>[data-slot=control]+[data-slot=description]]:mt-3', '[&>[data-slot=control]+[data-slot=error]]:mt-3', '*:data-[slot=label]:font-medium')}/>);
}
exports.Field = Field;
function Label({ className, ...props }) {
    return (<Headless.Label data-slot="label" {...props} className={(0, clsx_1.default)(className, 'text-base/6 text-zinc-950 select-none data-disabled:opacity-50 sm:text-sm/6 dark:text-white')}/>);
}
exports.Label = Label;
function Description({ className, ...props }) {
    return (<Headless.Description data-slot="description" {...props} className={(0, clsx_1.default)(className, 'text-base/6 text-zinc-500 data-disabled:opacity-50 sm:text-sm/6 dark:text-zinc-400')}/>);
}
exports.Description = Description;
function ErrorMessage({ className, ...props }) {
    return (<Headless.Description data-slot="error" {...props} className={(0, clsx_1.default)(className, 'text-base/6 text-red-600 data-disabled:opacity-50 sm:text-sm/6 dark:text-red-500')}/>);
}
exports.ErrorMessage = ErrorMessage;
