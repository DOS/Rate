"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiNewsletterForm = void 0;
const AppLink_1 = __importDefault(require("@/components/elementary/AppLink"));
const Container_1 = require("@/components/elementary/Container");
const NewsletterForm_1 = require("@/components/elementary/forms/NewsletterForm");
function StrapiNewsletterForm({ component, }) {
    return (<div className="bg-blue-light pb-10">
      <Container_1.Container className="flex flex-col justify-between gap-y-10 lg:flex-row">
        <div className="flex w-full max-w-[510px] flex-1 flex-col gap-10">
          <h1 className="text-3xl font-bold">{component.title}</h1>
          <p>{component.description}</p>
        </div>
        <div className="flex w-full max-w-[560px] flex-1 items-end align-bottom">
          <div className="w-fll mt-1 flex w-full flex-col gap-1">
            <NewsletterForm_1.NewsletterForm />
            <div className="mt-2 flex items-center">
              {component.gdpr?.href && (<AppLink_1.default openExternalInNewTab={Boolean(component.gdpr.newTab)} className="text-blue-700 underline" href={component.gdpr.href}>
                  {component.gdpr.label}
                </AppLink_1.default>)}
            </div>
          </div>
        </div>
      </Container_1.Container>
    </div>);
}
exports.StrapiNewsletterForm = StrapiNewsletterForm;
StrapiNewsletterForm.displayName = "StrapiNewsletterForm";
exports.default = StrapiNewsletterForm;
