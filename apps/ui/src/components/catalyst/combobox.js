'use client';
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
exports.ComboboxDescription = exports.ComboboxLabel = exports.ComboboxOption = exports.Combobox = void 0;
const Headless = __importStar(require("@headlessui/react"));
const clsx_1 = __importDefault(require("clsx"));
const react_1 = require("react");
function Combobox({ options, displayValue, filter, anchor = 'bottom', className, placeholder, autoFocus, 'aria-label': ariaLabel, children, ...props }) {
    const [query, setQuery] = (0, react_1.useState)('');
    const filteredOptions = query === ''
        ? options
        : options.filter((option) => filter ? filter(option, query) : displayValue(option)?.toLowerCase().includes(query.toLowerCase()));
    return (<Headless.Combobox {...props} multiple={false} virtual={{ options: filteredOptions }} onClose={() => setQuery('')}>
      <span data-slot="control" className={(0, clsx_1.default)([
            className,
            // Basic layout
            'relative block w-full',
            // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
            'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-sm',
            // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
            'dark:before:hidden',
            // Focus ring
            'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset sm:focus-within:after:ring-2 sm:focus-within:after:ring-blue-500',
            // Disabled state
            'has-data-disabled:opacity-50 has-data-disabled:before:bg-zinc-950/5 has-data-disabled:before:shadow-none',
            // Invalid state
            'has-data-invalid:before:shadow-red-500/10',
        ])}>
        <Headless.ComboboxInput autoFocus={autoFocus} data-slot="control" aria-label={ariaLabel} displayValue={(option) => displayValue(option) ?? ''} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className={(0, clsx_1.default)([
            className,
            // Basic layout
            'relative block w-full appearance-none rounded-lg py-[calc(--spacing(2.5)-1px)] sm:py-[calc(--spacing(1.5)-1px)]',
            // Horizontal padding
            'pr-[calc(--spacing(10)-1px)] pl-[calc(--spacing(3.5)-1px)] sm:pr-[calc(--spacing(9)-1px)] sm:pl-[calc(--spacing(3)-1px)]',
            // Typography
            'text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6 dark:text-white',
            // Border
            'border border-zinc-950/10 data-hover:border-zinc-950/20 dark:border-white/10 dark:data-hover:border-white/20',
            // Background color
            'bg-transparent dark:bg-white/5',
            // Hide default focus styles
            'focus:outline-hidden',
            // Invalid state
            'data-invalid:border-red-500 data-invalid:data-hover:border-red-500 dark:data-invalid:border-red-500 dark:data-invalid:data-hover:border-red-500',
            // Disabled state
            'data-disabled:border-zinc-950/20 dark:data-disabled:border-white/15 dark:data-disabled:bg-white/2.5 dark:data-hover:data-disabled:border-white/15',
            // System icons
            'dark:scheme-dark',
        ])}/>
        <Headless.ComboboxButton className="group absolute inset-y-0 right-0 flex items-center px-2">
          <svg className="size-5 stroke-zinc-500 group-data-disabled:stroke-zinc-600 group-data-hover:stroke-zinc-700 sm:size-4 dark:stroke-zinc-400 dark:group-data-hover:stroke-zinc-300 forced-colors:stroke-[CanvasText]" viewBox="0 0 16 16" aria-hidden="true" fill="none">
            <path d="M5.75 10.75L8 13L10.25 10.75" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10.25 5.25L8 3L5.75 5.25" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Headless.ComboboxButton>
      </span>
      <Headless.ComboboxOptions transition anchor={anchor} className={(0, clsx_1.default)(
        // Anchor positioning
        '[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(4)] sm:data-[anchor~=start]:[--anchor-offset:-4px]', 
        // Base styles,
        'isolate min-w-[calc(var(--input-width)+8px)] scroll-py-1 rounded-xl p-1 select-none empty:invisible', 
        // Invisible border that is only visible in `forced-colors` mode for accessibility purposes
        'outline outline-transparent focus:outline-hidden', 
        // Handle scrolling when menu won't fit in viewport
        'overflow-y-scroll overscroll-contain', 
        // Popover background
        'bg-white/75 backdrop-blur-xl dark:bg-zinc-800/75', 
        // Shadows
        'shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10 dark:ring-inset', 
        // Transitions
        'transition-opacity duration-100 ease-in data-closed:data-leave:opacity-0 data-transition:pointer-events-none')}>
        {({ option }) => children(option)}
      </Headless.ComboboxOptions>
    </Headless.Combobox>);
}
exports.Combobox = Combobox;
function ComboboxOption({ children, className, ...props }) {
    let sharedClasses = (0, clsx_1.default)(
    // Base
    'flex min-w-0 items-center', 
    // Icons
    '*:data-[slot=icon]:size-5 *:data-[slot=icon]:shrink-0 sm:*:data-[slot=icon]:size-4', '*:data-[slot=icon]:text-zinc-500 group-data-focus/option:*:data-[slot=icon]:text-white dark:*:data-[slot=icon]:text-zinc-400', 'forced-colors:*:data-[slot=icon]:text-[CanvasText] forced-colors:group-data-focus/option:*:data-[slot=icon]:text-[Canvas]', 
    // Avatars
    '*:data-[slot=avatar]:-mx-0.5 *:data-[slot=avatar]:size-6 sm:*:data-[slot=avatar]:size-5');
    return (<Headless.ComboboxOption {...props} className={(0, clsx_1.default)(
        // Basic layout
        'group/option grid w-full cursor-default grid-cols-[1fr_--spacing(5)] items-baseline gap-x-2 rounded-lg py-2.5 pr-2 pl-3.5 sm:grid-cols-[1fr_--spacing(4)] sm:py-1.5 sm:pr-2 sm:pl-3', 
        // Typography
        'text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]', 
        // Focus
        'outline-hidden data-focus:bg-blue-500 data-focus:text-white', 
        // Forced colors mode
        'forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText]', 
        // Disabled
        'data-disabled:opacity-50')}>
      <span className={(0, clsx_1.default)(className, sharedClasses)}>{children}</span>
      <svg className="relative col-start-2 hidden size-5 self-center stroke-current group-data-selected/option:inline sm:size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 8.5l3 3L12 4" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </Headless.ComboboxOption>);
}
exports.ComboboxOption = ComboboxOption;
function ComboboxLabel({ className, ...props }) {
    return <span {...props} className={(0, clsx_1.default)(className, 'ml-2.5 truncate first:ml-0 sm:ml-2 sm:first:ml-0')}/>;
}
exports.ComboboxLabel = ComboboxLabel;
function ComboboxDescription({ className, children, ...props }) {
    return (<span {...props} className={(0, clsx_1.default)(className, 'flex flex-1 overflow-hidden text-zinc-500 group-data-focus/option:text-white before:w-2 before:min-w-0 before:shrink dark:text-zinc-400')}>
      <span className="flex-1 truncate">{children}</span>
    </span>);
}
exports.ComboboxDescription = ComboboxDescription;
