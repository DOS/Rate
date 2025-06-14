"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTableColumnHeader = void 0;
const react_icons_1 = require("@radix-ui/react-icons");
const lucide_react_1 = require("lucide-react");
const next_intl_1 = require("next-intl");
const utils_1 = require("@/lib/utils");
const button_1 = require("@/components/ui/button");
const dropdown_menu_1 = require("@/components/ui/dropdown-menu");
function DataTableColumnHeader({ column, title, className, withDropdown, }) {
    const t = (0, next_intl_1.useTranslations)("tables");
    if (!column.getCanSort()) {
        return <div className={(0, utils_1.cn)(className)}>{title}</div>;
    }
    if (!withDropdown) {
        return (<button_1.Button variant="ghost" size="sm" className="data-[state=open]:bg-accent -ml-3 h-8" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        <span>{title}</span>
        <lucide_react_1.ArrowUpDown className="ml-2 size-4"/>
      </button_1.Button>);
    }
    return (<div className={(0, utils_1.cn)("flex items-center space-x-2", className)}>
      <dropdown_menu_1.DropdownMenu>
        <dropdown_menu_1.DropdownMenuTrigger asChild>
          <button_1.Button variant="ghost" size="sm" className="data-[state=open]:bg-accent -ml-3 h-8">
            <span>{title}</span>
            {column.getIsSorted() === "desc" ? (<react_icons_1.ArrowDownIcon className="ml-2 size-4"/>) : column.getIsSorted() === "asc" ? (<react_icons_1.ArrowUpIcon className="ml-2 size-4"/>) : (<react_icons_1.CaretSortIcon className="ml-2 size-4"/>)}
          </button_1.Button>
        </dropdown_menu_1.DropdownMenuTrigger>

        <dropdown_menu_1.DropdownMenuContent align="start">
          <dropdown_menu_1.DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <react_icons_1.ArrowUpIcon className="text-muted-foreground/70 mr-2 size-3.5"/>
            {t("ascending")}
          </dropdown_menu_1.DropdownMenuItem>
          <dropdown_menu_1.DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <react_icons_1.ArrowDownIcon className="text-muted-foreground/70 mr-2 size-3.5"/>
            {t("descending")}
          </dropdown_menu_1.DropdownMenuItem>
          {/* <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
          <EyeNoneIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
          Hide
        </DropdownMenuItem> */}
        </dropdown_menu_1.DropdownMenuContent>
      </dropdown_menu_1.DropdownMenu>
    </div>);
}
exports.DataTableColumnHeader = DataTableColumnHeader;
