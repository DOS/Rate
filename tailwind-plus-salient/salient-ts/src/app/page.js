"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const CallToAction_1 = require("@/components/CallToAction");
const Faqs_1 = require("@/components/Faqs");
const Footer_1 = require("@/components/Footer");
const Header_1 = require("@/components/Header");
const Hero_1 = require("@/components/Hero");
const Pricing_1 = require("@/components/Pricing");
const PrimaryFeatures_1 = require("@/components/PrimaryFeatures");
const SecondaryFeatures_1 = require("@/components/SecondaryFeatures");
const Testimonials_1 = require("@/components/Testimonials");
function Home() {
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
exports.default = Home;
