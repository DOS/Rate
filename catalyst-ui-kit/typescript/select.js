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
exports.Select = void 0;
const Headless = __importStar(require("@headlessui/react"));
const clsx_1 = __importDefault(require("clsx"));
const react_1 = __importStar(require("react"));
exports.Select = (0, react_1.forwardRef)(function Select({ className, multiple, ...props }, ref) {
    return (<span data-slot="control" className={(0, clsx_1.default)([
            className,
            // Basic layout
            'group relative block w-full',
            // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
            'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-sm',
            // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
            'dark:before:hidden',
            // Focus ring
            'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset has-data-focus:after:ring-2 has-data-focus:after:ring-blue-500',
            // Disabled state
            'has-data-disabled:opacity-50 has-data-disabled:before:bg-zinc-950/5 has-data-disabled:before:shadow-none',
        ])}>
      <Headless.Select ref={ref} multiple={multiple} {...props} className={(0, clsx_1.default)([
            // Basic layout
            'relative block w-full appearance-none rounded-lg py-[calc(--spacing(2.5)-1px)] sm:py-[calc(--spacing(1.5)-1px)]',
            // Horizontal padding
            multiple
                ? 'px-[calc(--spacing(3.5)-1px)] sm:px-[calc(--spacing(3)-1px)]'
                : 'pr-[calc(--spacing(10)-1px)] pl-[calc(--spacing(3.5)-1px)] sm:pr-[calc(--spacing(9)-1px)] sm:pl-[calc(--spacing(3)-1px)]',
            // Options (multi-select)
            '[&_optgroup]:font-semibold',
            // Typography
            'text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6 dark:text-white dark:*:text-white',
            // Border
            'border border-zinc-950/10 data-hover:border-zinc-950/20 dark:border-white/10 dark:data-hover:border-white/20',
            // Background color
            'bg-transparent dark:bg-white/5 dark:*:bg-zinc-800',
            // Hide default focus styles
            'focus:outline-hidden',
            // Invalid state
            'data-invalid:border-red-500 data-invalid:data-hover:border-red-500 dark:data-invalid:border-red-600 dark:data-invalid:data-hover:border-red-600',
            // Disabled state
            'data-disabled:border-zinc-950/20 data-disabled:opacity-100 dark:data-disabled:border-white/15 dark:data-disabled:bg-white/2.5 dark:data-hover:data-disabled:border-white/15',
        ])}/>
      {!multiple && (<span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <svg className="size-5 stroke-zinc-500 group-has-data-disabled:stroke-zinc-600 sm:size-4 dark:stroke-zinc-400 forced-colors:stroke-[CanvasText]" viewBox="0 0 16 16" aria-hidden="true" fill="none">
            <path d="M5.75 10.75L8 13L10.25 10.75" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10.25 5.25L8 3L5.75 5.25" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>)}
    </span>);
});
