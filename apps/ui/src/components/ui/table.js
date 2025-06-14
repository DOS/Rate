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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableCaption = exports.TableCell = exports.TableRow = exports.TableHead = exports.TableFooter = exports.TableBody = exports.TableHeader = exports.Table = void 0;
const React = __importStar(require("react"));
const utils_1 = require("@/lib/utils");
function Table({ className, ...props }) {
    return (<div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={(0, utils_1.cn)("w-full caption-bottom text-sm", className)} {...props}/>
    </div>);
}
exports.Table = Table;
function TableHeader({ className, ...props }) {
    return (<thead data-slot="table-header" className={(0, utils_1.cn)("[&_tr]:border-b", className)} {...props}/>);
}
exports.TableHeader = TableHeader;
function TableBody({ className, ...props }) {
    return (<tbody data-slot="table-body" className={(0, utils_1.cn)("[&_tr:last-child]:border-0", className)} {...props}/>);
}
exports.TableBody = TableBody;
const TableFooter = React.forwardRef(({ className, ...props }, ref) => (<tfoot ref={ref} className={(0, utils_1.cn)("bg-primary text-primary-foreground font-medium", className)} {...props}/>));
exports.TableFooter = TableFooter;
TableFooter.displayName = "TableFooter";
const TableRow = React.forwardRef(({ className, ...props }, ref) => (<tr ref={ref} className={(0, utils_1.cn)("hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors", className)} {...props}/>));
exports.TableRow = TableRow;
TableRow.displayName = "TableRow";
const TableHead = React.forwardRef(({ className, ...props }, ref) => (<th ref={ref} className={(0, utils_1.cn)("text-muted-foreground h-10 px-2 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className)} {...props}/>));
exports.TableHead = TableHead;
TableHead.displayName = "TableHead";
const TableCell = React.forwardRef(({ className, ...props }, ref) => (<td ref={ref} className={(0, utils_1.cn)("p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className)} {...props}/>));
exports.TableCell = TableCell;
TableCell.displayName = "TableCell";
const TableCaption = React.forwardRef(({ className, ...props }, ref) => (<caption ref={ref} className={(0, utils_1.cn)("text-muted-foreground mt-4 text-sm", className)} {...props}/>));
exports.TableCaption = TableCaption;
TableCaption.displayName = "TableCaption";
