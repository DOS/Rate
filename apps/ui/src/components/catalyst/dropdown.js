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
exports.DropdownShortcut = exports.DropdownDescription = exports.DropdownLabel = exports.DropdownDivider = exports.DropdownHeading = exports.DropdownSection = exports.DropdownHeader = exports.DropdownItem = exports.DropdownMenu = exports.DropdownButton = exports.Dropdown = void 0;
const Headless = __importStar(require("@headlessui/react"));
const clsx_1 = __importDefault(require("clsx"));
const button_1 = require("./button");
const link_1 = require("./link");
function Dropdown(props) {
    return <Headless.Menu {...props}/>;
}
exports.Dropdown = Dropdown;
function DropdownButton({ as, className, ...props }) {
    return (<Headless.MenuButton {...props} as={as || button_1.Button} className={className}/>);
}
exports.DropdownButton = DropdownButton;
function DropdownMenu({ anchor = 'bottom', className, ...props }) {
    return (<Headless.MenuItems {...props} transition anchor={anchor} className={(0, clsx_1.default)(className, 
        // Anchor positioning
        '[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(1)] data-[anchor~=end]:[--anchor-offset:6px] data-[anchor~=start]:[--anchor-offset:-6px] sm:data-[anchor~=end]:[--anchor-offset:4px] sm:data-[anchor~=start]:[--anchor-offset:-4px]', 
        // Base styles
        'isolate w-max rounded-xl p-1', 
        // Invisible border that is only visible in `forced-colors` mode for accessibility purposes
        'outline outline-transparent focus:outline-hidden', 
        // Handle scrolling when menu won't fit in viewport
        'overflow-y-auto', 
        // Popover background
        'bg-white/75 backdrop-blur-xl dark:bg-zinc-800/75', 
        // Shadows
        'shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10 dark:ring-inset', 
        // Define grid at the menu level if subgrid is supported
        'supports-[grid-template-columns:subgrid]:grid supports-[grid-template-columns:subgrid]:grid-cols-[auto_1fr_1.5rem_0.5rem_auto]', 
        // Transitions
        'transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0')}/>);
}
exports.DropdownMenu = DropdownMenu;
function DropdownItem({ className, ...props }) {
    let classes = (0, clsx_1.default)(className, 
    // Base styles
    'group cursor-default rounded-lg px-3.5 py-2.5 focus:outline-hidden sm:px-3 sm:py-1.5', 
    // Text styles
    'text-left text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]', 
    // Focus
    'data-focus:bg-blue-500 data-focus:text-white', 
    // Disabled state
    'data-disabled:opacity-50', 
    // Forced colors mode
    'forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText] forced-colors:data-focus:*:data-[slot=icon]:text-[HighlightText]', 
    // Use subgrid when available but fallback to an explicit grid layout if not
    'col-span-full grid grid-cols-[auto_1fr_1.5rem_0.5rem_auto] items-center supports-[grid-template-columns:subgrid]:grid-cols-subgrid', 
    // Icons
    '*:data-[slot=icon]:col-start-1 *:data-[slot=icon]:row-start-1 *:data-[slot=icon]:mr-2.5 *:data-[slot=icon]:-ml-0.5 *:data-[slot=icon]:size-5 sm:*:data-[slot=icon]:mr-2 sm:*:data-[slot=icon]:size-4', '*:data-[slot=icon]:text-zinc-500 data-focus:*:data-[slot=icon]:text-white dark:*:data-[slot=icon]:text-zinc-400 dark:data-focus:*:data-[slot=icon]:text-white', 
    // Avatar
    '*:data-[slot=avatar]:mr-2.5 *:data-[slot=avatar]:-ml-1 *:data-[slot=avatar]:size-6 sm:*:data-[slot=avatar]:mr-2 sm:*:data-[slot=avatar]:size-5');
    return 'href' in props ? (<Headless.MenuItem as={link_1.Link} {...props} className={classes}/>) : (<Headless.MenuItem as="button" type="button" {...props} className={classes}/>);
}
exports.DropdownItem = DropdownItem;
function DropdownHeader({ className, ...props }) {
    return <div {...props} className={(0, clsx_1.default)(className, 'col-span-5 px-3.5 pt-2.5 pb-1 sm:px-3')}/>;
}
exports.DropdownHeader = DropdownHeader;
function DropdownSection({ className, ...props }) {
    return (<Headless.MenuSection {...props} className={(0, clsx_1.default)(className, 
        // Define grid at the section level instead of the item level if subgrid is supported
        'col-span-full supports-[grid-template-columns:subgrid]:grid supports-[grid-template-columns:subgrid]:grid-cols-[auto_1fr_1.5rem_0.5rem_auto]')}/>);
}
exports.DropdownSection = DropdownSection;
function DropdownHeading({ className, ...props }) {
    return (<Headless.MenuHeading {...props} className={(0, clsx_1.default)(className, 'col-span-full grid grid-cols-[1fr_auto] gap-x-12 px-3.5 pt-2 pb-1 text-sm/5 font-medium text-zinc-500 sm:px-3 sm:text-xs/5 dark:text-zinc-400')}/>);
}
exports.DropdownHeading = DropdownHeading;
function DropdownDivider({ className, ...props }) {
    return (<Headless.MenuSeparator {...props} className={(0, clsx_1.default)(className, 'col-span-full mx-3.5 my-1 h-px border-0 bg-zinc-950/5 sm:mx-3 dark:bg-white/10 forced-colors:bg-[CanvasText]')}/>);
}
exports.DropdownDivider = DropdownDivider;
function DropdownLabel({ className, ...props }) {
    return (<Headless.Label {...props} data-slot="label" className={(0, clsx_1.default)(className, 'col-start-2 row-start-1')} {...props}/>);
}
exports.DropdownLabel = DropdownLabel;
function DropdownDescription({ className, ...props }) {
    return (<Headless.Description data-slot="description" {...props} className={(0, clsx_1.default)(className, 'col-span-2 col-start-2 row-start-2 text-sm/5 text-zinc-500 group-data-focus:text-white sm:text-xs/5 dark:text-zinc-400 forced-colors:group-data-focus:text-[HighlightText]')}/>);
}
exports.DropdownDescription = DropdownDescription;
function DropdownShortcut({ keys, className, ...props }) {
    return (<Headless.Description as="kbd" {...props} className={(0, clsx_1.default)(className, 'col-start-5 row-start-1 flex justify-self-end')}>
      {(Array.isArray(keys) ? keys : keys.split('')).map((char, index) => (<kbd key={index} className={(0, clsx_1.default)([
                'min-w-[2ch] text-center font-sans text-zinc-400 capitalize group-data-focus:text-white forced-colors:group-data-focus:text-[HighlightText]',
                // Make sure key names that are longer than one character (like "Tab") have extra space
                index > 0 && char.length > 1 && 'pl-1',
            ])}>
          {char}
        </kbd>))}
    </Headless.Description>);
}
exports.DropdownShortcut = DropdownShortcut;
