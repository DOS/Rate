"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTablePagination = void 0;
const react_icons_1 = require("@radix-ui/react-icons");
const next_intl_1 = require("next-intl");
const button_1 = require("@/components/ui/button");
const select_1 = require("@/components/ui/select");
function DataTablePagination({ table, simple }) {
    const t = (0, next_intl_1.useTranslations)("tables");
    if (simple) {
        return (<div className="flex items-center justify-end space-x-2 py-4">
        <button_1.Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          {t("previousPage")}
        </button_1.Button>
        <button_1.Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          {t("nextPage")}
        </button_1.Button>
      </div>);
    }
    return (<div className="flex items-center justify-between px-2 py-4">
      <div className="text-muted-foreground flex-1 text-sm">
        {/* {table.getFilteredSelectedRowModel().rows.length} of{" "} */}
        {table.getFilteredRowModel().rows.length}
        {/* selected. */}
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">{t("rowsPerPage")}</p>
          <select_1.Select value={`${table.getState().pagination.pageSize}`} onValueChange={(value) => {
            table.setPageSize(Number(value));
        }}>
            <select_1.SelectTrigger className="h-8 w-[70px]">
              <select_1.SelectValue placeholder={table.getState().pagination.pageSize}/>
            </select_1.SelectTrigger>
            <select_1.SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (<select_1.SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </select_1.SelectItem>))}
            </select_1.SelectContent>
          </select_1.Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          {t("pageXOfY", {
            x: table.getState().pagination.pageIndex + 1,
            y: table.getPageCount(),
        })}
        </div>
        <div className="flex items-center space-x-2">
          <button_1.Button variant="outline" className="hidden size-8 p-0 lg:flex" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            <span className="sr-only">{t("firstPage")}</span>
            <react_icons_1.DoubleArrowLeftIcon className="size-4"/>
          </button_1.Button>
          <button_1.Button variant="outline" className="size-8 p-0" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <span className="sr-only">{t("previousPage")}</span>
            <react_icons_1.ChevronLeftIcon className="size-4"/>
          </button_1.Button>
          <button_1.Button variant="outline" className="size-8 p-0" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <span className="sr-only">{t("nextPage")}</span>
            <react_icons_1.ChevronRightIcon className="size-4"/>
          </button_1.Button>
          <button_1.Button variant="outline" className="hidden size-8 p-0 lg:flex" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
            <span className="sr-only">{t("lastPage")}</span>
            <react_icons_1.DoubleArrowRightIcon className="size-4"/>
          </button_1.Button>
        </div>
      </div>
    </div>);
}
exports.DataTablePagination = DataTablePagination;
