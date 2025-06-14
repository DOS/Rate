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
exports.AlertActions = exports.AlertBody = exports.AlertDescription = exports.AlertTitle = exports.Alert = void 0;
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
function Alert({ size = 'md', className, children, ...props }) {
    return (<Headless.Dialog {...props}>
      <Headless.DialogBackdrop transition className="fixed inset-0 flex w-screen justify-center overflow-y-auto bg-zinc-950/15 px-2 py-2 transition duration-100 focus:outline-0 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:px-6 sm:py-8 lg:px-8 lg:py-16 dark:bg-zinc-950/50"/>

      <div className="fixed inset-0 w-screen overflow-y-auto pt-6 sm:pt-0">
        <div className="grid min-h-full grid-rows-[1fr_auto_1fr] justify-items-center p-8 sm:grid-rows-[1fr_auto_3fr] sm:p-4">
          <Headless.DialogPanel transition className={(0, clsx_1.default)(className, sizes[size], 'row-start-2 w-full rounded-2xl bg-white p-8 shadow-lg ring-1 ring-zinc-950/10 sm:rounded-2xl sm:p-6 dark:bg-zinc-900 dark:ring-white/10 forced-colors:outline', 'transition duration-100 will-change-transform data-closed:opacity-0 data-enter:ease-out data-closed:data-enter:scale-95 data-leave:ease-in')}>
            {children}
          </Headless.DialogPanel>
        </div>
      </div>
    </Headless.Dialog>);
}
exports.Alert = Alert;
function AlertTitle({ className, ...props }) {
    return (<Headless.DialogTitle {...props} className={(0, clsx_1.default)(className, 'text-center text-base/6 font-semibold text-balance text-zinc-950 sm:text-left sm:text-sm/6 sm:text-wrap dark:text-white')}/>);
}
exports.AlertTitle = AlertTitle;
function AlertDescription({ className, ...props }) {
    return (<Headless.Description as={text_1.Text} {...props} className={(0, clsx_1.default)(className, 'mt-2 text-center text-pretty sm:text-left')}/>);
}
exports.AlertDescription = AlertDescription;
function AlertBody({ className, ...props }) {
    return <div {...props} className={(0, clsx_1.default)(className, 'mt-4')}/>;
}
exports.AlertBody = AlertBody;
function AlertActions({ className, ...props }) {
    return (<div {...props} className={(0, clsx_1.default)(className, 'mt-6 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:mt-4 sm:flex-row sm:*:w-auto')}/>);
}
exports.AlertActions = AlertActions;
