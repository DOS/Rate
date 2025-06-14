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
exports.NavbarLabel = exports.NavbarItem = exports.NavbarSpacer = exports.NavbarSection = exports.NavbarDivider = exports.Navbar = void 0;
const Headless = __importStar(require("@headlessui/react"));
const clsx_1 = __importDefault(require("clsx"));
const framer_motion_1 = require("framer-motion");
const react_1 = __importStar(require("react"));
const button_1 = require("./button");
const link_1 = require("./link");
function Navbar({ className, ...props }) {
    return <nav {...props} className={(0, clsx_1.default)(className, 'flex flex-1 items-center gap-4 py-2.5')}/>;
}
exports.Navbar = Navbar;
function NavbarDivider({ className, ...props }) {
    return <div aria-hidden="true" {...props} className={(0, clsx_1.default)(className, 'h-6 w-px bg-zinc-950/10 dark:bg-white/10')}/>;
}
exports.NavbarDivider = NavbarDivider;
function NavbarSection({ className, ...props }) {
    let id = (0, react_1.useId)();
    return (<framer_motion_1.LayoutGroup id={id}>
      <div {...props} className={(0, clsx_1.default)(className, 'flex items-center gap-3')}/>
    </framer_motion_1.LayoutGroup>);
}
exports.NavbarSection = NavbarSection;
function NavbarSpacer({ className, ...props }) {
    return <div aria-hidden="true" {...props} className={(0, clsx_1.default)(className, '-ml-4 flex-1')}/>;
}
exports.NavbarSpacer = NavbarSpacer;
exports.NavbarItem = (0, react_1.forwardRef)(function NavbarItem({ current, className, children, ...props }, ref) {
    let classes = (0, clsx_1.default)(
    // Base
    'relative flex min-w-0 items-center gap-3 rounded-lg p-2 text-left text-base/6 font-medium text-zinc-950 sm:text-sm/5', 
    // Leading icon/icon-only
    '*:data-[slot=icon]:size-6 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:fill-zinc-500 sm:*:data-[slot=icon]:size-5', 
    // Trailing icon (down chevron or similar)
    '*:not-nth-2:last:data-[slot=icon]:ml-auto *:not-nth-2:last:data-[slot=icon]:size-5 sm:*:not-nth-2:last:data-[slot=icon]:size-4', 
    // Avatar
    '*:data-[slot=avatar]:-m-0.5 *:data-[slot=avatar]:size-7 *:data-[slot=avatar]:[--avatar-radius:var(--radius-md)] sm:*:data-[slot=avatar]:size-6', 
    // Hover
    'data-hover:bg-zinc-950/5 data-hover:*:data-[slot=icon]:fill-zinc-950', 
    // Active
    'data-active:bg-zinc-950/5 data-active:*:data-[slot=icon]:fill-zinc-950', 
    // Dark mode
    'dark:text-white dark:*:data-[slot=icon]:fill-zinc-400', 'dark:data-hover:bg-white/5 dark:data-hover:*:data-[slot=icon]:fill-white', 'dark:data-active:bg-white/5 dark:data-active:*:data-[slot=icon]:fill-white');
    return (<span className={(0, clsx_1.default)(className, 'relative')}>
      {current && (<framer_motion_1.motion.span layoutId="current-indicator" className="absolute inset-x-2 -bottom-2.5 h-0.5 rounded-full bg-zinc-950 dark:bg-white"/>)}
      {'href' in props ? (<link_1.Link {...props} className={classes} data-current={current ? 'true' : undefined} ref={ref}>
          <button_1.TouchTarget>{children}</button_1.TouchTarget>
        </link_1.Link>) : (<Headless.Button {...props} className={(0, clsx_1.default)('cursor-default', classes)} data-current={current ? 'true' : undefined} ref={ref}>
          <button_1.TouchTarget>{children}</button_1.TouchTarget>
        </Headless.Button>)}
    </span>);
});
function NavbarLabel({ className, ...props }) {
    return <span {...props} className={(0, clsx_1.default)(className, 'truncate')}/>;
}
exports.NavbarLabel = NavbarLabel;
