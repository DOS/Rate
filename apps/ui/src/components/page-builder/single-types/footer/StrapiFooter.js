"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiFooter = void 0;
const react_1 = require("react");
const strapi_api_1 = require("@/lib/strapi-api");
const utils_1 = require("@/lib/utils");
const Container_1 = require("@/components/elementary/Container");
const StrapiImageWithLink_1 = __importDefault(require("@/components/page-builder/components/utilities/StrapiImageWithLink"));
const StrapiLink_1 = __importDefault(require("@/components/page-builder/components/utilities/StrapiLink"));
async function fetchData(locale) {
    try {
        return await strapi_api_1.PublicStrapiClient.fetchOne("api::footer.footer", undefined, {
            locale,
            populate: {
                sections: { populate: { links: true } },
                logoImage: { populate: { image: true, link: true } },
                links: true,
            },
        });
    }
    catch (e) {
        console.error(`Data for "api::footer.footer" content type wasn't fetched: `, e?.message);
        return undefined;
    }
}
async function StrapiFooter({ locale }) {
    const response = await fetchData(locale);
    const component = response?.data;
    if (component == null) {
        return null;
    }
    return (<div className="w-full border-t bg-white/10 shadow-sm backdrop-blur transition-colors duration-300">
      <Container_1.Container className="pt-8 pb-4">
        <div className="grid grid-cols-1 gap-6 pb-4 sm:grid-cols-[30%_1fr]">
          <div className="flex flex-col space-y-4">
            <StrapiImageWithLink_1.default component={component.logoImage} imageProps={{ hideWhenMissing: true }}/>
          </div>

          <div className={(0, utils_1.cn)("grid gap-8")}>
            {component.sections?.map((section) => (<div className="flex flex-col" key={section.id}>
                <h3 className="pb-2 text-lg font-bold">{section.title}</h3>

                {section.links?.map((link, i) => (<StrapiLink_1.default key={String(link.id) + i} component={link} className="text-primary w-fit text-sm hover:underline"/>))}
              </div>))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            {component.copyRight && (<p className="">
                {component.copyRight.replace("{YEAR}", new Date().getFullYear().toString())}
              </p>)}
          </div>

          <div className="flex flex-col items-end sm:flex-row sm:items-center sm:space-x-4">
            {component.links?.map((link, i) => (<react_1.Fragment key={String(link.id) + i}>
                <StrapiLink_1.default component={link} className="text-primary relative w-fit text-sm hover:underline"/>

                {i < component.links.length - 1 && (<span key={link.id + "_dot"} className="mx-2 hidden pt-0.5 sm:inline-block">
                    •
                  </span>)}
              </react_1.Fragment>))}
          </div>
        </div>
      </Container_1.Container>
    </div>);
}
exports.StrapiFooter = StrapiFooter;
StrapiFooter.displayName = "StrapiFooter";
exports.default = StrapiFooter;
