"use client";
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateRangePicker = void 0;
const react_1 = require("react");
const dayjs_1 = __importDefault(require("dayjs"));
const lucide_react_1 = require("lucide-react");
const next_intl_1 = require("next-intl");
const utils_1 = require("@/lib/utils");
const button_1 = require("@/components/ui/button");
const calendar_1 = require("@/components/ui/calendar");
const popover_1 = require("@/components/ui/popover");
const DATE_FORMAT = "LLL dd, y";
function DateRangePicker({ className, date, setDate }) {
    const t = (0, next_intl_1.useTranslations)("comps.dateRangePicker");
    const selectedDate = (0, react_1.useMemo)(() => {
        if (date?.from != null) {
            if (date?.to != null) {
                return (<>
            {(0, dayjs_1.default)(date.from).format(DATE_FORMAT)}
            <span className="mx-1">-</span>
            {(0, dayjs_1.default)(date.to).format(DATE_FORMAT)}
          </>);
            }
            return (0, dayjs_1.default)(date.from).format(DATE_FORMAT);
        }
        return <span>{t("label")}</span>;
    }, [date, t]);
    return (<div className={(0, utils_1.cn)("grid gap-2", className)}>
      <popover_1.Popover>
        <popover_1.PopoverTrigger asChild>
          <button_1.Button id="date" variant="outline" className={(0, utils_1.cn)("w-[300px] justify-center font-normal", !date && "text-muted-foreground")}>
            <lucide_react_1.Calendar className="mr-2 size-4"/>
            {selectedDate}
          </button_1.Button>
        </popover_1.PopoverTrigger>
        <popover_1.PopoverContent className="w-auto p-0" align="center">
          <calendar_1.Calendar autoFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2}/>
        </popover_1.PopoverContent>
      </popover_1.Popover>
    </div>);
}
exports.DateRangePicker = DateRangePicker;
