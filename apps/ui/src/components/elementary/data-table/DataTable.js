"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTable = void 0;
const react_1 = require("react");
const react_table_1 = require("@tanstack/react-table");
const next_intl_1 = require("next-intl");
const input_1 = require("@/components/ui/input");
const skeleton_1 = require("@/components/ui/skeleton");
const table_1 = require("@/components/ui/table");
const DataTablePagination_1 = require("./DataTablePagination");
function DataTable({ columns, data, isLoading, allowSearching, pagination, searchAdornment, }) {
    const t = (0, next_intl_1.useTranslations)();
    const [sorting, setSorting] = (0, react_1.useState)([]);
    const [globalFilter, setGlobalFilter] = (0, react_1.useState)("");
    const table = (0, react_table_1.useReactTable)({
        data,
        columns,
        getCoreRowModel: (0, react_table_1.getCoreRowModel)(),
        getPaginationRowModel: (0, react_table_1.getPaginationRowModel)(),
        getSortedRowModel: (0, react_table_1.getSortedRowModel)(),
        getFilteredRowModel: (0, react_table_1.getFilteredRowModel)(),
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        state: {
            sorting,
            globalFilter,
        },
    });
    return (<div>
      {allowSearching && (<div className="flex items-center justify-between py-4">
          <input_1.Input placeholder={`${t("general.search")} (${table.getCoreRowModel().rows.length})...`} value={globalFilter ?? ""} onChange={(event) => setGlobalFilter(String(event.target.value))} className="max-w-sm rounded-lg border"/>
          {searchAdornment}
        </div>)}

      <div className="rounded-md border">
        <table_1.Table>
          <table_1.TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (<table_1.TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                return (<table_1.TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : (0, react_table_1.flexRender)(header.column.columnDef.header, header.getContext())}
                    </table_1.TableHead>);
            })}
              </table_1.TableRow>))}
          </table_1.TableHeader>

          {isLoading ? (<DataTableSkeleton headerGroup={table.getHeaderGroups()[0]}/>) : (<table_1.TableBody>
              {table.getRowModel().rows?.length ? (table.getRowModel().rows.map((row) => (<table_1.TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                    {row.getVisibleCells().map((cell) => (<table_1.TableCell key={cell.id}>
                        {(0, react_table_1.flexRender)(cell.column.columnDef.cell, cell.getContext())}
                      </table_1.TableCell>))}
                  </table_1.TableRow>))) : (<table_1.TableRow>
                  <table_1.TableCell colSpan={columns.length} className="h-24 text-center">
                    {t("tables.noData")}
                  </table_1.TableCell>
                </table_1.TableRow>)}
            </table_1.TableBody>)}
        </table_1.Table>
      </div>

      {pagination && (<DataTablePagination_1.DataTablePagination table={table} simple={pagination === "simple"}/>)}
    </div>);
}
exports.DataTable = DataTable;
const DataTableSkeleton = ({ headerGroup, }) => {
    return (<>
      {Array.from({ length: 2 }).map((_, i) => (<SkeletonLine headerGroup={headerGroup} key={i}/>))}
    </>);
};
const SkeletonLine = ({ headerGroup, }) => {
    return (<table_1.TableBody>
      <table_1.TableRow>
        {headerGroup.headers.map((header) => (<table_1.TableCell key={header.id} className="h-6">
            <skeleton_1.Skeleton className="h-3"/>
          </table_1.TableCell>))}
      </table_1.TableRow>
    </table_1.TableBody>);
};
