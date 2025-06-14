"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeroPremium = void 0;
const utils_1 = require("@/lib/utils");
const StrapiBasicImage_1 = require("@/components/page-builder/components/utilities/StrapiBasicImage");
const StrapiLink_1 = require("@/components/page-builder/components/utilities/StrapiLink");
const Container_1 = require("@/components/elementary/Container");
const Heading_1 = require("@/components/typography/Heading");
const Paragraph_1 = require("@/components/typography/Paragraph");
// Simple SVG icons
const CheckIcon = ({ className }) => (<svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
  </svg>);
const PlayIcon = ({ className }) => (<svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
  </svg>);
const ArrowIcon = ({ className }) => (<svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/>
  </svg>);
function HeroPremium({ component, }) {
    return (<section className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-blue-900 dark:to-indigo-900">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.1'%3E%3Ccircle cx='10' cy='10' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}/>
      
      <Container_1.Container className="relative px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
            {/* Content */}
            <div className="flex flex-col justify-center lg:col-span-6">
              <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
                {/* Badge */}
                <div className="mb-6 inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 ring-1 ring-indigo-700/10 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-300/20">
                  <span>✨ Tailwind UI Premium</span>
                </div>

                <Heading_1.Heading tag="h1" className="mb-6 bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-4xl font-bold tracking-tight text-transparent dark:from-gray-100 dark:via-indigo-100 dark:to-purple-100 sm:text-5xl lg:text-6xl">
                  {component.title}
                </Heading_1.Heading>
                
                {component.subTitle && (<Paragraph_1.Paragraph className="mb-8 text-lg leading-relaxed text-gray-600 dark:text-gray-300">
                    {component.subTitle}
                  </Paragraph_1.Paragraph>)}

                {/* Steps with enhanced styling */}
                {component?.steps && component?.steps?.length > 0 && (<ul className="mb-8 space-y-3">
                    {component.steps.map((step) => (<li key={step.id} className="flex items-center gap-3">
                        <CheckIcon className="h-5 w-5 flex-shrink-0 text-emerald-500"/>
                        <Paragraph_1.Paragraph className="text-gray-700 dark:text-gray-300">
                          {step.text}
                        </Paragraph_1.Paragraph>
                      </li>))}
                  </ul>)}

                {/* CTA Buttons */}
                {component?.links && component?.links?.length > 0 && (<div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                    {component.links.map((link, index) => (<StrapiLink_1.StrapiLink key={link.id} component={link} className={(0, utils_1.cn)("group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold transition-all duration-200", index === 0
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    : "border-2 border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 dark:hover:bg-gray-700")}>
                        {index === 0 && <PlayIcon className="h-4 w-4"/>}
                        {link.label}
                        <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1"/>
                      </StrapiLink_1.StrapiLink>))}
                  </div>)}

                {/* Social proof */}
                <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row lg:justify-start">
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (<svg key={i} className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>))}
                    <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">4.9/5 rating</span>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">from 1000+ users</span>
                </div>
              </div>
            </div>

            {/* Image */}
            {component.image && (<div className="relative lg:col-span-6">
                <div className="relative mx-auto aspect-[4/3] max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl shadow-gray-900/20 ring-1 ring-gray-900/10 lg:max-w-none">
                  <StrapiBasicImage_1.StrapiBasicImage component={component.image} className="h-full w-full object-cover"/>
                  <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-gray-900/10"/>
                </div>
                
                {/* Floating elements */}
                <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 opacity-20 blur-xl"/>
                <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 opacity-20 blur-xl"/>
              </div>)}
          </div>
        </div>
      </Container_1.Container>
    </section>);
}
exports.HeroPremium = HeroPremium;
HeroPremium.displayName = "HeroPremium";
exports.default = HeroPremium;
