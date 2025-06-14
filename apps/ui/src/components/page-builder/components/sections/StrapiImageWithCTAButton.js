"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiImageWithCTAButton = void 0;
const Container_1 = require("@/components/elementary/Container");
const StrapiBasicImage_1 = require("@/components/page-builder/components/utilities/StrapiBasicImage");
const StrapiLink_1 = __importDefault(require("@/components/page-builder/components/utilities/StrapiLink"));
const StrapiImageWithCTAButton = ({ component, }) => {
    return (<section>
      <Container_1.Container className="items-center gap-4 md:grid md:grid-cols-2 xl:gap-8">
        <div className="flex justify-center">
          <StrapiBasicImage_1.StrapiBasicImage component={component.image} className="w-full object-contain object-center" hideWhenMissing forcedSizes={{ height: 300 }}/>
        </div>

        <div className="mt-4 md:mt-0">
          <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            {component.title}
          </h2>
          {component.subText && (<p className="mb-6 font-light text-gray-500 md:text-lg dark:text-gray-400">
              {component.subText}
            </p>)}

          <StrapiLink_1.default component={component.link} className="focus:ring-primary-300 bg-primary inline-flex items-center justify-center rounded-lg px-5 py-3 text-center text-base font-medium text-white focus:ring-4"/>
        </div>
      </Container_1.Container>
    </section>);
};
exports.StrapiImageWithCTAButton = StrapiImageWithCTAButton;
exports.StrapiImageWithCTAButton.displayName = "StrapiImageWithCTAButton";
exports.default = exports.StrapiImageWithCTAButton;
