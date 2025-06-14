"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiHeadingWithCTAButton = void 0;
const react_1 = __importDefault(require("react"));
const Container_1 = require("@/components/elementary/Container");
const StrapiLink_1 = __importDefault(require("@/components/page-builder/components/utilities/StrapiLink"));
const StrapiHeadingWithCTAButton = ({ component, }) => {
    return (<section className="px-4 py-8 sm:py-16 lg:px-6">
      <Container_1.Container>
        <div className="mx-auto max-w-(--breakpoint-sm) text-center">
          <h2 className="mb-4 text-4xl leading-tight font-extrabold tracking-tight text-gray-900">
            {component.title}
          </h2>
          {component.subText && (<p className="mb-6 font-light text-gray-500 md:text-lg">
              {component.subText}
            </p>)}

          <StrapiLink_1.default component={component.cta} className="focus:ring-primary-300 bg-primary inline-flex items-center justify-center rounded-lg px-5 py-3 text-center text-base font-medium text-white focus:ring-4"/>
        </div>
      </Container_1.Container>
    </section>);
};
exports.StrapiHeadingWithCTAButton = StrapiHeadingWithCTAButton;
exports.StrapiHeadingWithCTAButton.displayName = "StrapiHeadingWithCTAButton";
exports.default = exports.StrapiHeadingWithCTAButton;
