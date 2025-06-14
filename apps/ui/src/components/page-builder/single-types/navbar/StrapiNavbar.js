"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiNavbar = void 0;
const image_1 = __importDefault(require("next/image"));
const server_1 = require("next-intl/server");
const auth_1 = require("@/lib/auth");
const strapi_api_1 = require("@/lib/strapi-api");
const utils_1 = require("@/lib/utils");
const AppLink_1 = __importDefault(require("@/components/elementary/AppLink"));
const LocaleSwitcher_1 = __importDefault(require("@/components/elementary/LocaleSwitcher"));
const StrapiImageWithLink_1 = __importDefault(require("@/components/page-builder/components/utilities/StrapiImageWithLink"));
const StrapiLink_1 = __importDefault(require("@/components/page-builder/components/utilities/StrapiLink"));
const LoggedUserMenu_1 = require("@/components/page-builder/single-types/navbar/LoggedUserMenu");
async function fetchData(locale) {
    try {
        return await strapi_api_1.PublicStrapiClient.fetchOne("api::navbar.navbar", undefined, {
            locale,
            populate: {
                links: true,
                logoImage: { populate: { image: true, link: true } },
            },
        });
    }
    catch (e) {
        console.error(`Data for "api::navbar.navbar" content type wasn't fetched: `, e?.message);
        return undefined;
    }
}
async function StrapiNavbar({ locale }) {
    const response = await fetchData(locale);
    const navbar = response?.data;
    if (navbar == null) {
        return null;
    }
    const t = await (0, server_1.getTranslations)("navbar");
    const links = (navbar.links ?? []).filter((link) => link.href);
    const session = await (0, auth_1.getAuth)();
    return (<header className="sticky top-0 z-40 w-full border-b bg-white/90 shadow-sm backdrop-blur transition-colors duration-300">
      <div className="flex h-16 items-center space-x-6 px-6 sm:space-x-0">
        <div className="flex gap-6 md:gap-10">
          {navbar.logoImage ? (<StrapiImageWithLink_1.default component={navbar.logoImage} linkProps={{ className: "flex items-center space-x-2" }} imageProps={{
                forcedSizes: { width: 90, height: 60 },
                hideWhenMissing: true,
            }}/>) : (<AppLink_1.default href="/" className="text-xl font-bold">
              <image_1.default src="/images/logo.svg" alt="logo" height={23} width={82}/>
            </AppLink_1.default>)}

          {links.length > 0 ? (<nav className="flex">
              {links.map((link) => (<StrapiLink_1.default component={link} key={link.href} className={(0, utils_1.cn)("flex items-center text-sm font-medium hover:text-red-600")}/>))}
            </nav>) : null}
        </div>

        <div className="hidden flex-1 items-center justify-end space-x-4 lg:flex">
          {session?.user ? (<nav className="flex items-center space-x-1">
              <LoggedUserMenu_1.LoggedUserMenu user={session.user}/>
            </nav>) : (<AppLink_1.default href="/auth/signin">{t("actions.signIn")}</AppLink_1.default>)}
          <LocaleSwitcher_1.default locale={locale}/>
        </div>
      </div>
    </header>);
}
exports.StrapiNavbar = StrapiNavbar;
StrapiNavbar.displayName = "StrapiNavbar";
exports.default = StrapiNavbar;
