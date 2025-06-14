"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiHorizontalImages = void 0;
const utils_1 = require("@/lib/utils");
const Container_1 = require("@/components/elementary/Container");
const StrapiImageWithLink_1 = __importDefault(require("@/components/page-builder/components/utilities/StrapiImageWithLink"));
function StrapiHorizontalImages({ component, }) {
    return (<section>
      <Container_1.Container className="py-8">
        <div className="flex flex-col items-center">
          <p className="mb-6 text-center tracking-tight text-gray-900">
            {component.title}
          </p>

          <div className={(0, utils_1.cn)("no-scrollbar flex max-w-full overflow-x-auto", `space-x-${component.spacing ?? 4}`)}>
            {component.images?.map((x, i) => (<StrapiImageWithLink_1.default component={x} key={String(x.id) + i} imageProps={{
                className: (0, utils_1.cn)({
                    [`rounded-${component.imageRadius}`]: Boolean(component.imageRadius),
                    "object-cover": Boolean(component.fixedImageHeight ?? component.fixedImageWidth),
                }),
                forcedSizes: {
                    width: component.fixedImageWidth,
                    height: component.fixedImageHeight,
                },
            }}/>))}
          </div>
        </div>
      </Container_1.Container>
    </section>);
}
exports.StrapiHorizontalImages = StrapiHorizontalImages;
StrapiHorizontalImages.displayName = "StrapiHorizontalImages";
exports.default = StrapiHorizontalImages;
