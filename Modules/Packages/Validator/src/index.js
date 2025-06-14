"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateScamReport = void 0;
const scamReportSchema_1 = require("./scamReportSchema");
function validateScamReport(data) {
    const result = scamReportSchema_1.scamReportSchema.safeParse(data);
    if (!result.success) {
        return {
            valid: false,
            error: result.error.issues.map(i => i.message).join(', '),
            issues: result.error.issues
        };
    }
    return { valid: true, data: result.data };
}
exports.validateScamReport = validateScamReport;
