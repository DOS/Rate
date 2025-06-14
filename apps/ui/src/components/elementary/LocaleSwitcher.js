"use client";
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
const react_1 = __importStar(require("react"));
const navigation_1 = require("next/navigation");
const navigation_2 = require("@/lib/navigation");
const select_1 = require("@/components/ui/select");
const localeTranslation = {
    cs: "Czech",
    en: "English",
    vi: "Vietnamese",
};
const LocaleSwitcher = ({ locale }) => {
    // prevent the locale switch from blocking the UI thread
    const [, startTransition] = (0, react_1.useTransition)();
    const pathname = (0, navigation_2.usePathname)();
    const router = (0, navigation_2.useRouter)();
    const searchParams = (0, navigation_1.useSearchParams)();
    const handleLocaleChange = (locale) => {
        const queryParams = searchParams.toString();
        // next-intl router.replace does not persist query params
        startTransition(() => {
            router.replace(queryParams.length > 0 ? `${pathname}?${queryParams}` : pathname, { locale });
        });
    };
    return (<select_1.Select value={locale} onValueChange={handleLocaleChange}>
      <select_1.SelectTrigger className="w-18 font-bold uppercase">
        {locale}
      </select_1.SelectTrigger>
      <select_1.SelectContent>
        {navigation_2.routing.locales.map((locale, index) => (<react_1.default.Fragment key={locale}>
            <select_1.SelectItem key={locale} value={locale}>
              {localeTranslation[locale]}
            </select_1.SelectItem>
            {index < navigation_2.routing.locales.length - 1 && (<select_1.SelectSeparator key={`${locale}-separator`}/>)}
          </react_1.default.Fragment>))}
      </select_1.SelectContent>
    </select_1.Select>);
};
exports.default = LocaleSwitcher;
