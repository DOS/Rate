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
exports.DialogActions = exports.DialogBody = exports.DialogDescription = exports.DialogTitle = exports.Dialog = void 0;
const Headless = __importStar(require("@headlessui/react"));
const clsx_1 = __importDefault(require("clsx"));
const text_1 = require("./text");
const sizes = {
    xs: 'sm:max-w-xs',
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl',
    '3xl': 'sm:max-w-3xl',
    '4xl': 'sm:max-w-4xl',
    '5xl': 'sm:max-w-5xl',
};
function Dialog({ size = 'lg', className, children, ...props }) {
    return (<Headless.Dialog {...props}>
      <Headless.DialogBackdrop transition className="fixed inset-0 flex w-screen justify-center overflow-y-auto bg-zinc-950/25 px-2 py-2 transition duration-100 focus:outline-0 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:px-6 sm:py-8 lg:px-8 lg:py-16 dark:bg-zinc-950/50"/>

      <div className="fixed inset-0 w-screen overflow-y-auto pt-6 sm:pt-0">
        <div className="grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4">
          <Headless.DialogPanel transition className={(0, clsx_1.default)(className, sizes[size], 'row-start-2 w-full min-w-0 rounded-t-3xl bg-white p-(--gutter) shadow-lg ring-1 ring-zinc-950/10 [--gutter:--spacing(8)] sm:mb-auto sm:rounded-2xl dark:bg-zinc-900 dark:ring-white/10 forced-colors:outline', 'transition duration-100 will-change-transform data-closed:translate-y-12 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:data-closed:translate-y-0 sm:data-closed:data-enter:scale-95')}>
            {children}
          </Headless.DialogPanel>
        </div>
      </div>
    </Headless.Dialog>);
}
exports.Dialog = Dialog;
function DialogTitle({ className, ...props }) {
    return (<Headless.DialogTitle {...props} className={(0, clsx_1.default)(className, 'text-lg/6 font-semibold text-balance text-zinc-950 sm:text-base/6 dark:text-white')}/>);
}
exports.DialogTitle = DialogTitle;
function DialogDescription({ className, ...props }) {
    return <Headless.Description as={text_1.Text} {...props} className={(0, clsx_1.default)(className, 'mt-2 text-pretty')}/>;
}
exports.DialogDescription = DialogDescription;
function DialogBody({ className, ...props }) {
    return <div {...props} className={(0, clsx_1.default)(className, 'mt-6')}/>;
}
exports.DialogBody = DialogBody;
function DialogActions({ className, ...props }) {
    return (<div {...props} className={(0, clsx_1.default)(className, 'mt-8 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:flex-row sm:*:w-auto')}/>);
}
exports.DialogActions = DialogActions;
