"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_icons_1 = require("@radix-ui/react-icons");
const server_1 = require("next-intl/server");
const navigation_1 = require("@/lib/navigation");
async function NotFound() {
    const t = await (0, server_1.getTranslations)("errors.notFound");
    return (<div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center gap-2">
      <react_icons_1.LinkBreak2Icon className="size-8"/>
      <div className="text-center">
        <h2 className="mb-4 text-2xl font-semibold">{t("title")}</h2>
        <p>{t("description")}</p>
      </div>
      <p>{t("solution")}</p>
      <navigation_1.Link className="rounded-xl bg-gray-900 px-4 py-2 text-white transition-colors duration-500 hover:bg-gray-700" href="/">
        {t("redirect")}
      </navigation_1.Link>
    </div>);
}
exports.default = NotFound;
