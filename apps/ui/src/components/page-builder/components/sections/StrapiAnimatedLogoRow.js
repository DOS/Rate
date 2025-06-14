"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiAnimatedLogoRow = void 0;
const utils_1 = require("@/lib/utils");
const StrapiBasicImage_1 = require("@/components/page-builder/components/utilities/StrapiBasicImage");
const Heading_1 = __importDefault(require("@/components/typography/Heading"));
function StrapiAnimatedLogoRow({ component, }) {
    if (!component.logos)
        return null;
    const sliderImages = [...component.logos, ...component.logos];
    return (<section className="w-full py-10">
      <div className="flex flex-col items-center gap-[30px]">
        <Heading_1.default tag="h3" variant="heading4" fontWeight="normal">
          {component.text}
        </Heading_1.default>

        <div className="relative mt-4 w-full">
          <div className="infinite-scroll-container-horizontal w-full">
            <div className={(0, utils_1.cn)("infinite-scroll-horizontal flex gap-14 overflow-hidden", component.logos?.length > 10 && "justify-center")}>
              {sliderImages.map((logo, index) => (<div key={String(logo.id) + index} className="grayscale">
                  <StrapiBasicImage_1.StrapiBasicImage component={logo} forcedSizes={{ width: 200 }} priority={index < 10} loading="eager" className="z-10 max-h-10 w-full object-contain"/>
                </div>))}
            </div>
          </div>
          <div className="bg-gradient-slider absolute top-0 left-0 size-full opacity-80"/>
        </div>
      </div>
    </section>);
}
exports.StrapiAnimatedLogoRow = StrapiAnimatedLogoRow;
StrapiAnimatedLogoRow.displayName = "StrapiAnimatedLogoRow";
exports.default = StrapiAnimatedLogoRow;
