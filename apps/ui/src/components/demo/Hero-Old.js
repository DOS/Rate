"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeroOld = void 0;
const lucide_react_1 = require("lucide-react");
const Container_1 = require("@/components/elementary/Container");
const StrapiBasicImage_1 = require("@/components/page-builder/components/utilities/StrapiBasicImage");
const StrapiLink_1 = __importDefault(require("@/components/page-builder/components/utilities/StrapiLink"));
const Heading_1 = __importDefault(require("@/components/typography/Heading"));
const Paragraph_1 = require("@/components/typography/Paragraph");
function HeroOld({ component, }) {
    return (<section style={{ backgroundColor: component.bgColor ?? "transparent" }}>
      <Container_1.Container className="grid gap-6 px-4 py-8 md:grid-cols-12 lg:py-12 xl:gap-0">
        <div className="mr-auto flex w-full flex-col justify-center md:col-span-6">
          <Heading_1.default tag="h1" variant="heading1" className="mb-4 max-w-2xl text-center lg:text-start">
            {component.title}
          </Heading_1.default>
          {component.subTitle && (<Paragraph_1.Paragraph className="mb-6 max-w-2xl text-center lg:text-start">
              {component.subTitle}
            </Paragraph_1.Paragraph>)}
          {component?.steps &&
            component?.steps?.length > 0 &&
            component.steps.map((step) => (<div key={step.id} className="flex items-center gap-1 py-2">
                <lucide_react_1.Check className="text-primary-500"/>
                <Paragraph_1.Paragraph>{step.text}</Paragraph_1.Paragraph>
              </div>))}

          {component.links && (<div className="space-x flex flex-col gap-2 pt-4 lg:flex-row">
              {component.links.map((link, i) => (<StrapiLink_1.default key={i} component={link} className="focus:ring-primary-300 bg-primary mr-3 inline-flex w-full items-center justify-center rounded-lg px-5 py-3 text-center text-base font-medium text-white focus:ring-4 lg:w-fit"/>))}
            </div>)}
        </div>

        {component.image?.media && (<div className="hidden md:col-span-6 md:mt-0 md:flex">
            <StrapiBasicImage_1.StrapiBasicImage component={component.image} className="rounded-3xl object-contain" forcedSizes={{ height: 500 }}/>
          </div>)}
      </Container_1.Container>
    </section>);
}
exports.HeroOld = HeroOld;
HeroOld.displayName = "HeroOld";
exports.default = HeroOld;
