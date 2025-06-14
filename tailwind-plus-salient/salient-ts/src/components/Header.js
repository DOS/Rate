'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Header = void 0;
const link_1 = __importDefault(require("next/link"));
const react_1 = require("@headlessui/react");
const clsx_1 = __importDefault(require("clsx"));
const Button_1 = require("@/components/Button");
const Container_1 = require("@/components/Container");
const Logo_1 = require("@/components/Logo");
const NavLink_1 = require("@/components/NavLink");
function MobileNavLink({ href, children, }) {
    return (<react_1.PopoverButton as={link_1.default} href={href} className="block w-full p-2">
      {children}
    </react_1.PopoverButton>);
}
function MobileNavIcon({ open }) {
    return (<svg aria-hidden="true" className="h-3.5 w-3.5 overflow-visible stroke-slate-700" fill="none" strokeWidth={2} strokeLinecap="round">
      <path d="M0 1H14M0 7H14M0 13H14" className={(0, clsx_1.default)('origin-center transition', open && 'scale-90 opacity-0')}/>
      <path d="M2 2L12 12M12 2L2 12" className={(0, clsx_1.default)('origin-center transition', !open && 'scale-90 opacity-0')}/>
    </svg>);
}
function MobileNavigation() {
    return (<react_1.Popover>
      <react_1.PopoverButton className="relative z-10 flex h-8 w-8 items-center justify-center focus:not-data-focus:outline-hidden" aria-label="Toggle Navigation">
        {({ open }) => <MobileNavIcon open={open}/>}
      </react_1.PopoverButton>
      <react_1.PopoverBackdrop transition className="fixed inset-0 bg-slate-300/50 duration-150 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"/>
      <react_1.PopoverPanel transition className="absolute inset-x-0 top-full mt-4 flex origin-top flex-col rounded-2xl bg-white p-4 text-lg tracking-tight text-slate-900 shadow-xl ring-1 ring-slate-900/5 data-closed:scale-95 data-closed:opacity-0 data-enter:duration-150 data-enter:ease-out data-leave:duration-100 data-leave:ease-in">
        <MobileNavLink href="#features">Features</MobileNavLink>
        <MobileNavLink href="#testimonials">Testimonials</MobileNavLink>
        <MobileNavLink href="#pricing">Pricing</MobileNavLink>
        <hr className="m-2 border-slate-300/40"/>
        <MobileNavLink href="/login">Sign in</MobileNavLink>
      </react_1.PopoverPanel>
    </react_1.Popover>);
}
function Header() {
    return (<header className="py-10">
      <Container_1.Container>
        <nav className="relative z-50 flex justify-between">
          <div className="flex items-center md:gap-x-12">
            <link_1.default href="#" aria-label="Home">
              <Logo_1.Logo className="h-10 w-auto"/>
            </link_1.default>
            <div className="hidden md:flex md:gap-x-6">
              <NavLink_1.NavLink href="#features">Features</NavLink_1.NavLink>
              <NavLink_1.NavLink href="#testimonials">Testimonials</NavLink_1.NavLink>
              <NavLink_1.NavLink href="#pricing">Pricing</NavLink_1.NavLink>
            </div>
          </div>
          <div className="flex items-center gap-x-5 md:gap-x-8">
            <div className="hidden md:block">
              <NavLink_1.NavLink href="/login">Sign in</NavLink_1.NavLink>
            </div>
            <Button_1.Button href="/register" color="blue">
              <span>
                Get started <span className="hidden lg:inline">today</span>
              </span>
            </Button_1.Button>
            <div className="-mr-1 md:hidden">
              <MobileNavigation />
            </div>
          </div>
        </nav>
      </Container_1.Container>
    </header>);
}
exports.Header = Header;
