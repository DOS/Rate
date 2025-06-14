"use client";
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatePicker = void 0;
const react_1 = require("react");
const dayjs_1 = __importDefault(require("dayjs"));
const lucide_react_1 = require("lucide-react");
const next_intl_1 = require("next-intl");
const utils_1 = require("@/lib/utils");
const button_1 = require("@/components/ui/button");
const calendar_1 = require("@/components/ui/calendar");
const popover_1 = require("@/components/ui/popover");
function DatePicker({ defaultDate = (0, dayjs_1.default)(new Date()).subtract(2, "D").toDate(), }) {
    const [date, setDate] = (0, react_1.useState)(defaultDate);
    const t = (0, next_intl_1.useTranslations)("comps.datePicker");
    return (<popover_1.Popover>
      <popover_1.PopoverTrigger asChild>
        <button_1.Button variant="outline" className={(0, utils_1.cn)("w-[280px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
          <lucide_react_1.Calendar className="mr-2 size-4"/>
          {date ? (0, dayjs_1.default)(date).format("LL") : <span>{t("label")}</span>}
        </button_1.Button>
      </popover_1.PopoverTrigger>
      <popover_1.PopoverContent className="w-auto p-0">
        <calendar_1.Calendar mode="single" selected={date} onSelect={setDate} autoFocus/>
      </popover_1.PopoverContent>
    </popover_1.Popover>);
}
exports.DatePicker = DatePicker;
