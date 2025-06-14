"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("next-intl/server");
const CallToAction_1 = require("@/components/salient/CallToAction");
const Faqs_1 = require("@/components/salient/Faqs");
const Footer_1 = require("@/components/salient/Footer");
const Header_1 = require("@/components/salient/Header");
const Hero_1 = require("@/components/salient/Hero");
const Pricing_1 = require("@/components/salient/Pricing");
const PrimaryFeatures_1 = require("@/components/salient/PrimaryFeatures");
const SecondaryFeatures_1 = require("@/components/salient/SecondaryFeatures");
const Testimonials_1 = require("@/components/salient/Testimonials");
async function SalientDemo({ params }) {
    const { locale } = await params;
    (0, server_1.setRequestLocale)(locale);
    return (<>
      <Header_1.Header />
      <main>
        <Hero_1.Hero />
        <PrimaryFeatures_1.PrimaryFeatures />
        <SecondaryFeatures_1.SecondaryFeatures />
        <CallToAction_1.CallToAction />
        <Testimonials_1.Testimonials />
        <Pricing_1.Pricing />
        <Faqs_1.Faqs />
      </main>
      <Footer_1.Footer />
    </>);
}
exports.default = SalientDemo;
