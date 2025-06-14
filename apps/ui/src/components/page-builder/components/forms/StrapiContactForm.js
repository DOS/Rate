"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiContactForm = void 0;
const Container_1 = require("@/components/elementary/Container");
const ContactForm_1 = require("@/components/elementary/forms/ContactForm");
const Heading_1 = __importDefault(require("@/components/typography/Heading"));
const Paragraph_1 = __importDefault(require("@/components/typography/Paragraph"));
function StrapiContactForm({ component, }) {
    return (<div className="bg-white" id="form-section">
      <Container_1.Container className="flex flex-col gap-10 lg:flex-row lg:gap-40">
        <div className="flex flex-1">
          <div className="flex max-w-[400px] flex-col gap-10">
            {component.title && (<Heading_1.default variant="heading3" tag="h3">
                {component.title}
              </Heading_1.default>)}
            {component.description && (<Paragraph_1.default>{component.description}</Paragraph_1.default>)}
          </div>
        </div>
        <div className="flex flex-1">
          <ContactForm_1.ContactForm gdpr={{
            href: component.gdpr?.href ?? undefined,
            label: component.gdpr?.label ?? undefined,
            newTab: component.gdpr?.newTab ?? false,
        }}/>
        </div>
      </Container_1.Container>
    </div>);
}
exports.StrapiContactForm = StrapiContactForm;
StrapiContactForm.displayName = "StrapiContactForm";
exports.default = StrapiContactForm;
