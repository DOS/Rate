'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableCell = exports.TableHeader = exports.TableRow = exports.TableBody = exports.TableHead = exports.Table = void 0;
const clsx_1 = __importDefault(require("clsx"));
const react_1 = require("react");
const link_1 = require("./link");
const TableContext = (0, react_1.createContext)({
    bleed: false,
    dense: false,
    grid: false,
    striped: false,
});
function Table({ bleed = false, dense = false, grid = false, striped = false, className, children, ...props }) {
    return (<TableContext.Provider value={{ bleed, dense, grid, striped }}>
      <div className="flow-root">
        <div {...props} className={(0, clsx_1.default)(className, '-mx-(--gutter) overflow-x-auto whitespace-nowrap')}>
          <div className={(0, clsx_1.default)('inline-block min-w-full align-middle', !bleed && 'sm:px-(--gutter)')}>
            <table className="min-w-full text-left text-sm/6 text-zinc-950 dark:text-white">{children}</table>
          </div>
        </div>
      </div>
    </TableContext.Provider>);
}
exports.Table = Table;
function TableHead({ className, ...props }) {
    return <thead {...props} className={(0, clsx_1.default)(className, 'text-zinc-500 dark:text-zinc-400')}/>;
}
exports.TableHead = TableHead;
function TableBody(props) {
    return <tbody {...props}/>;
}
exports.TableBody = TableBody;
const TableRowContext = (0, react_1.createContext)({
    href: undefined,
    target: undefined,
    title: undefined,
});
function TableRow({ href, target, title, className, ...props }) {
    let { striped } = (0, react_1.useContext)(TableContext);
    return (<TableRowContext.Provider value={{ href, target, title }}>
      <tr {...props} className={(0, clsx_1.default)(className, href &&
            'has-[[data-row-link][data-focus]]:outline-2 has-[[data-row-link][data-focus]]:-outline-offset-2 has-[[data-row-link][data-focus]]:outline-blue-500 dark:focus-within:bg-white/2.5', striped && 'even:bg-zinc-950/2.5 dark:even:bg-white/2.5', href && striped && 'hover:bg-zinc-950/5 dark:hover:bg-white/5', href && !striped && 'hover:bg-zinc-950/2.5 dark:hover:bg-white/2.5')}/>
    </TableRowContext.Provider>);
}
exports.TableRow = TableRow;
function TableHeader({ className, ...props }) {
    let { bleed, grid } = (0, react_1.useContext)(TableContext);
    return (<th {...props} className={(0, clsx_1.default)(className, 'border-b border-b-zinc-950/10 px-4 py-2 font-medium first:pl-(--gutter,--spacing(2)) last:pr-(--gutter,--spacing(2)) dark:border-b-white/10', grid && 'border-l border-l-zinc-950/5 first:border-l-0 dark:border-l-white/5', !bleed && 'sm:first:pl-1 sm:last:pr-1')}/>);
}
exports.TableHeader = TableHeader;
function TableCell({ className, children, ...props }) {
    let { bleed, dense, grid, striped } = (0, react_1.useContext)(TableContext);
    let { href, target, title } = (0, react_1.useContext)(TableRowContext);
    let [cellRef, setCellRef] = (0, react_1.useState)(null);
    return (<td ref={href ? setCellRef : undefined} {...props} className={(0, clsx_1.default)(className, 'relative px-4 first:pl-(--gutter,--spacing(2)) last:pr-(--gutter,--spacing(2))', !striped && 'border-b border-zinc-950/5 dark:border-white/5', grid && 'border-l border-l-zinc-950/5 first:border-l-0 dark:border-l-white/5', dense ? 'py-2.5' : 'py-4', !bleed && 'sm:first:pl-1 sm:last:pr-1')}>
      {href && (<link_1.Link data-row-link href={href} target={target} aria-label={title} tabIndex={cellRef?.previousElementSibling === null ? 0 : -1} className="absolute inset-0 focus:outline-hidden"/>)}
      {children}
    </td>);
}
exports.TableCell = TableCell;
