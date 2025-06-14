"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaginationGap = exports.PaginationPage = exports.PaginationList = exports.PaginationNext = exports.PaginationPrevious = exports.Pagination = void 0;
const clsx_1 = __importDefault(require("clsx"));
const button_1 = require("./button");
function Pagination({ 'aria-label': ariaLabel = 'Page navigation', className, ...props }) {
    return <nav aria-label={ariaLabel} {...props} className={(0, clsx_1.default)(className, 'flex gap-x-2')}/>;
}
exports.Pagination = Pagination;
function PaginationPrevious({ href = null, className, children = 'Previous', }) {
    return (<span className={(0, clsx_1.default)(className, 'grow basis-0')}>
      <button_1.Button {...(href === null ? { disabled: true } : { href })} plain aria-label="Previous page">
        <svg className="stroke-current" data-slot="icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2.75 8H13.25M2.75 8L5.25 5.5M2.75 8L5.25 10.5" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {children}
      </button_1.Button>
    </span>);
}
exports.PaginationPrevious = PaginationPrevious;
function PaginationNext({ href = null, className, children = 'Next', }) {
    return (<span className={(0, clsx_1.default)(className, 'flex grow basis-0 justify-end')}>
      <button_1.Button {...(href === null ? { disabled: true } : { href })} plain aria-label="Next page">
        {children}
        <svg className="stroke-current" data-slot="icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M13.25 8L2.75 8M13.25 8L10.75 10.5M13.25 8L10.75 5.5" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button_1.Button>
    </span>);
}
exports.PaginationNext = PaginationNext;
function PaginationList({ className, ...props }) {
    return <span {...props} className={(0, clsx_1.default)(className, 'hidden items-baseline gap-x-2 sm:flex')}/>;
}
exports.PaginationList = PaginationList;
function PaginationPage({ href, className, current = false, children, }) {
    return (<button_1.Button href={href} plain aria-label={`Page ${children}`} aria-current={current ? 'page' : undefined} className={(0, clsx_1.default)(className, 'min-w-9 before:absolute before:-inset-px before:rounded-lg', current && 'before:bg-zinc-950/5 dark:before:bg-white/10')}>
      <span className="-mx-0.5">{children}</span>
    </button_1.Button>);
}
exports.PaginationPage = PaginationPage;
function PaginationGap({ className, children = <>&hellip;</>, ...props }) {
    return (<span aria-hidden="true" {...props} className={(0, clsx_1.default)(className, 'w-9 text-center text-sm/6 font-semibold text-zinc-950 select-none dark:text-white')}>
      {children}
    </span>);
}
exports.PaginationGap = PaginationGap;
