'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrimaryFeatures = void 0;
const react_1 = require("react");
const image_1 = __importDefault(require("next/image"));
const react_2 = require("@headlessui/react");
const clsx_1 = __importDefault(require("clsx"));
const Container_1 = require("@/components/Container");
const background_features_jpg_1 = __importDefault(require("@/images/background-features.jpg"));
const expenses_png_1 = __importDefault(require("@/images/screenshots/expenses.png"));
const payroll_png_1 = __importDefault(require("@/images/screenshots/payroll.png"));
const reporting_png_1 = __importDefault(require("@/images/screenshots/reporting.png"));
const vat_returns_png_1 = __importDefault(require("@/images/screenshots/vat-returns.png"));
const features = [
    {
        title: 'Payroll',
        description: "Keep track of everyone's salaries and whether or not they've been paid. Direct deposit not supported.",
        image: payroll_png_1.default,
    },
    {
        title: 'Claim expenses',
        description: "All of your receipts organized into one place, as long as you don't mind typing in the data by hand.",
        image: expenses_png_1.default,
    },
    {
        title: 'VAT handling',
        description: "We only sell our software to companies who don't deal with VAT at all, so technically we do all the VAT stuff they need.",
        image: vat_returns_png_1.default,
    },
    {
        title: 'Reporting',
        description: 'Easily export your data into an Excel spreadsheet where you can do whatever the hell you want with it.',
        image: reporting_png_1.default,
    },
];
function PrimaryFeatures() {
    let [tabOrientation, setTabOrientation] = (0, react_1.useState)('horizontal');
    (0, react_1.useEffect)(() => {
        let lgMediaQuery = window.matchMedia('(min-width: 1024px)');
        function onMediaQueryChange({ matches }) {
            setTabOrientation(matches ? 'vertical' : 'horizontal');
        }
        onMediaQueryChange(lgMediaQuery);
        lgMediaQuery.addEventListener('change', onMediaQueryChange);
        return () => {
            lgMediaQuery.removeEventListener('change', onMediaQueryChange);
        };
    }, []);
    return (<section id="features" aria-label="Features for running your books" className="relative overflow-hidden bg-blue-600 pt-20 pb-28 sm:py-32">
      <image_1.default className="absolute top-1/2 left-1/2 max-w-none translate-x-[-44%] translate-y-[-42%]" src={background_features_jpg_1.default} alt="" width={2245} height={1636} unoptimized/>
      <Container_1.Container className="relative">
        <div className="max-w-2xl md:mx-auto md:text-center xl:max-w-none">
          <h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl md:text-5xl">
            Everything you need to run your books.
          </h2>
          <p className="mt-6 text-lg tracking-tight text-blue-100">
            Well everything you need if you aren’t that picky about minor
            details like tax compliance.
          </p>
        </div>
        <react_2.TabGroup className="mt-16 grid grid-cols-1 items-center gap-y-2 pt-10 sm:gap-y-6 md:mt-20 lg:grid-cols-12 lg:pt-0" vertical={tabOrientation === 'vertical'}>
          {({ selectedIndex }) => (<>
              <div className="-mx-4 flex overflow-x-auto pb-4 sm:mx-0 sm:overflow-visible sm:pb-0 lg:col-span-5">
                <react_2.TabList className="relative z-10 flex gap-x-4 px-4 whitespace-nowrap sm:mx-auto sm:px-0 lg:mx-0 lg:block lg:gap-x-0 lg:gap-y-1 lg:whitespace-normal">
                  {features.map((feature, featureIndex) => (<div key={feature.title} className={(0, clsx_1.default)('group relative rounded-full px-4 py-1 lg:rounded-l-xl lg:rounded-r-none lg:p-6', selectedIndex === featureIndex
                    ? 'bg-white lg:bg-white/10 lg:ring-1 lg:ring-white/10 lg:ring-inset'
                    : 'hover:bg-white/10 lg:hover:bg-white/5')}>
                      <h3>
                        <react_2.Tab className={(0, clsx_1.default)('font-display text-lg data-selected:not-data-focus:outline-hidden', selectedIndex === featureIndex
                    ? 'text-blue-600 lg:text-white'
                    : 'text-blue-100 hover:text-white lg:text-white')}>
                          <span className="absolute inset-0 rounded-full lg:rounded-l-xl lg:rounded-r-none"/>
                          {feature.title}
                        </react_2.Tab>
                      </h3>
                      <p className={(0, clsx_1.default)('mt-2 hidden text-sm lg:block', selectedIndex === featureIndex
                    ? 'text-white'
                    : 'text-blue-100 group-hover:text-white')}>
                        {feature.description}
                      </p>
                    </div>))}
                </react_2.TabList>
              </div>
              <react_2.TabPanels className="lg:col-span-7">
                {features.map((feature) => (<react_2.TabPanel key={feature.title} unmount={false}>
                    <div className="relative sm:px-6 lg:hidden">
                      <div className="absolute -inset-x-4 top-[-6.5rem] bottom-[-4.25rem] bg-white/10 ring-1 ring-white/10 ring-inset sm:inset-x-0 sm:rounded-t-xl"/>
                      <p className="relative mx-auto max-w-2xl text-base text-white sm:text-center">
                        {feature.description}
                      </p>
                    </div>
                    <div className="mt-10 w-180 overflow-hidden rounded-xl bg-slate-50 shadow-xl shadow-blue-900/20 sm:w-auto lg:mt-0 lg:w-271.25">
                      <image_1.default className="w-full" src={feature.image} alt="" priority sizes="(min-width: 1024px) 67.8125rem, (min-width: 640px) 100vw, 45rem"/>
                    </div>
                  </react_2.TabPanel>))}
              </react_2.TabPanels>
            </>)}
        </react_2.TabGroup>
      </Container_1.Container>
    </section>);
}
exports.PrimaryFeatures = PrimaryFeatures;
