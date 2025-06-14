"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThemeToggle = void 0;
const lucide_react_1 = require("lucide-react");
const next_intl_1 = require("next-intl");
const next_themes_1 = require("next-themes");
const button_1 = require("@/components/ui/button");
function ThemeToggle() {
    const { setTheme, theme } = (0, next_themes_1.useTheme)();
    const t = (0, next_intl_1.useTranslations)();
    return (<button_1.Button variant="ghost" size="sm" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      <lucide_react_1.SunMedium className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"/>
      <lucide_react_1.Moon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"/>
      <span className="sr-only">{t("comps.themeToggle.label")}</span>
    </button_1.Button>);
}
exports.ThemeToggle = ThemeToggle;
