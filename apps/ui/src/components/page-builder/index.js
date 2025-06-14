"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageContentComponents = void 0;
const StrapiContactForm_1 = __importDefault(require("@/components/page-builder/components/forms/StrapiContactForm"));
const StrapiNewsletterForm_1 = __importDefault(require("@/components/page-builder/components/forms/StrapiNewsletterForm"));
const StrapiAnimatedLogoRow_1 = __importDefault(require("@/components/page-builder/components/sections/StrapiAnimatedLogoRow"));
const StrapiCarousel_1 = __importDefault(require("@/components/page-builder/components/sections/StrapiCarousel"));
const StrapiFaq_1 = __importDefault(require("@/components/page-builder/components/sections/StrapiFaq"));
const StrapiHeadingWithCTAButton_1 = __importDefault(require("@/components/page-builder/components/sections/StrapiHeadingWithCTAButton"));
const StrapiHero_1 = __importDefault(require("@/components/page-builder/components/sections/StrapiHero"));
const StrapiHorizontalImages_1 = __importDefault(require("@/components/page-builder/components/sections/StrapiHorizontalImages"));
const StrapiImageWithCTAButton_1 = __importDefault(require("@/components/page-builder/components/sections/StrapiImageWithCTAButton"));
const StrapiCkEditorContent_1 = __importDefault(require("@/components/page-builder/components/utilities/StrapiCkEditorContent"));
/**
 * Mapping of Strapi Component UID to React Component
 * TODO: This should map Strapi component uid -> component path to reduce bundle size, however this became an issue with nextjs 15 update
 */
exports.PageContentComponents = {
    // elements, seo-utilities, utilities
    // They are usually rendered or used deep inside other components or handlers
    // Add them here if they can be used on Page content level
    "utilities.ck-editor-content": StrapiCkEditorContent_1.default,
    // Sections
    "sections.animated-logo-row": StrapiAnimatedLogoRow_1.default,
    "sections.faq": StrapiFaq_1.default,
    "sections.carousel": StrapiCarousel_1.default,
    "sections.heading-with-cta-button": StrapiHeadingWithCTAButton_1.default,
    "sections.hero": StrapiHero_1.default,
    "sections.horizontal-images": StrapiHorizontalImages_1.default,
    "sections.image-with-cta-button": StrapiImageWithCTAButton_1.default,
    // Forms
    "forms.contact-form": StrapiContactForm_1.default,
    "forms.newsletter-form": StrapiNewsletterForm_1.default,
    // Add more components here
};
