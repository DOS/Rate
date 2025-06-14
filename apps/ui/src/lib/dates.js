"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiffInDays = exports.getToday = exports.formatDate = exports.formatDateRange = exports.setupDayJs = exports.DATE_TIME_FORMAT = exports.TIME_FORMAT = exports.DATE_FORMAT = void 0;
const dayjs_1 = __importDefault(require("dayjs"));
const cs_1 = __importDefault(require("dayjs/locale/cs"));
const localizedFormat_1 = __importDefault(require("dayjs/plugin/localizedFormat"));
const timezone_1 = __importDefault(require("dayjs/plugin/timezone"));
const utc_1 = __importDefault(require("dayjs/plugin/utc"));
exports.DATE_FORMAT = "DD/MM/YY";
exports.TIME_FORMAT = "H:mm";
exports.DATE_TIME_FORMAT = "DD/MM/YY HH:mm";
const setupDayJs = () => {
    dayjs_1.default.extend(utc_1.default);
    dayjs_1.default.extend(timezone_1.default);
    dayjs_1.default.extend(localizedFormat_1.default);
    dayjs_1.default.locale(cs_1.default);
    dayjs_1.default.tz.setDefault("Europe/Prague");
};
exports.setupDayJs = setupDayJs;
function formatDateRange(startDate, endDate, format = exports.DATE_FORMAT) {
    const start = (0, dayjs_1.default)(startDate);
    const end = (0, dayjs_1.default)(endDate);
    if (end.isSame(start, "day")) {
        return end.format(format);
    }
    if (end.isSame(start, "month")) {
        return `${start.format("DD")}–${end.format(format)}`;
    }
    if (!end.isSame(start, "month") && end.isSame(start, "year")) {
        return `${start.format("DD/MM")}–${end.format(format)}`;
    }
    if (!end.isSame(start, "year")) {
        return `${start.format(format)}–${end.format(format)}`;
    }
    return undefined;
}
exports.formatDateRange = formatDateRange;
function formatDate(date, format = exports.DATE_FORMAT) {
    return (0, dayjs_1.default)(date).format(format);
}
exports.formatDate = formatDate;
function getToday(format = exports.DATE_FORMAT) {
    return (0, dayjs_1.default)().format(format);
}
exports.getToday = getToday;
function getDiffInDays(startDate, endDate) {
    const start = (0, dayjs_1.default)(startDate);
    const end = (0, dayjs_1.default)(endDate);
    return end.diff(start, "day");
}
exports.getDiffInDays = getDiffInDays;
