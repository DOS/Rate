"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTranslatedZod = void 0;
const react_1 = __importDefault(require("react"));
const next_intl_1 = require("next-intl");
const zod_1 = require("zod");
/**
 * Hook that translates zod validation errors.
 *
 * All locale keys - https://raw.githubusercontent.com/aiji42/zod-i18n/main/packages/core/locales/en/zod.json
 * In case there are any missing keys and they will be used in validation, this will throw many errors in the console.
 */
function useTranslatedZod(zod) {
    const t = (0, next_intl_1.useTranslations)("errors.zodValidation");
    const errorMap = react_1.default.useCallback(
    // eslint-disable-next-line no-unused-vars
    (issue, _ctx) => {
        let message;
        // eslint-disable-next-line no-unused-vars
        const { code, ...values } = issue;
        switch (issue.code) {
            case zod_1.z.ZodIssueCode.invalid_type:
                if (issue.received === zod_1.z.ZodParsedType.undefined) {
                    message = "invalid_type_received_undefined";
                }
                else {
                    message = `invalid_type`;
                }
                break;
            case zod_1.z.ZodIssueCode.too_small:
                if (issue.type === "string") {
                    if (issue.exact) {
                        message = "too_small.string.exact";
                    }
                    else {
                        message = `too_small.string.${issue.inclusive ? "inclusive" : "exclusive"}`;
                    }
                }
                else if (issue.type === "number")
                    if (issue.exact) {
                        message = "too_small.number.exact";
                    }
                    else {
                        message = `too_small.number.${issue.inclusive ? "inclusive" : "exclusive"}`;
                    }
                else
                    message = "invalid_type";
                break;
            case zod_1.z.ZodIssueCode.too_big:
                if (issue.type === "string") {
                    if (issue.exact) {
                        message = "too_big.string.exact";
                    }
                    else {
                        message = `too_big.string.${issue.inclusive ? "inclusive" : "exclusive"}`;
                    }
                }
                else if (issue.type === "number")
                    if (issue.exact) {
                        message = "too_big.number.exact";
                    }
                    else {
                        message = `too_big.number.${issue.inclusive ? "inclusive" : "exclusive"}`;
                    }
                else
                    message = "invalid_type";
                break;
            case zod_1.z.ZodIssueCode.invalid_string:
                if (typeof issue.validation === "object") {
                    if ("includes" in issue.validation) {
                        message = `Invalid input: must include "${issue.validation.includes}"`;
                        if (typeof issue.validation.position === "number") {
                            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
                        }
                    }
                    else if ("startsWith" in issue.validation) {
                        message = `Invalid input: must start with "${issue.validation.startsWith}"`;
                    }
                    else if ("endsWith" in issue.validation) {
                        message = `Invalid input: must end with "${issue.validation.endsWith}"`;
                    }
                    else {
                        zod_1.z.util.assertNever(issue.validation);
                    }
                }
                else {
                    message = `invalid_string.regex`;
                }
                break;
            case zod_1.z.ZodIssueCode.custom:
                if (issue.params?.type === "passwordNumber") {
                    message = "custom.passwordWithNumber";
                }
                else if (issue.params?.type === "phoneNumber") {
                    message = "custom.phoneNumber";
                }
                else if (issue.params?.type === "checkPassword") {
                    message = "custom.password";
                }
                break;
            default:
                message = issue.code;
        }
        return { message: t(message, values) };
    }, [t]);
    react_1.default.useEffect(() => {
        zod.setErrorMap(errorMap);
    }, [errorMap, zod]);
    return {};
}
exports.useTranslatedZod = useTranslatedZod;
