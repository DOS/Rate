"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMetadata = exports.generateStaticParams = void 0;
const navigation_1 = require("next/navigation");
const shared_data_1 = require("@repo/shared-data");
const server_1 = require("next-intl/server");
const general_helpers_1 = require("@/lib/general-helpers");
const metadata_1 = require("@/lib/metadata");
const navigation_2 = require("@/lib/navigation");
const strapi_api_1 = require("@/lib/strapi-api");
const page_1 = require("@/lib/strapi-api/content/page");
const utils_1 = require("@/lib/utils");
const Breadcrumbs_1 = require("@/components/elementary/Breadcrumbs");
const Container_1 = require("@/components/elementary/Container");
const ErrorBoundary_1 = require("@/components/elementary/ErrorBoundary");
const page_builder_1 = require("@/components/page-builder");
const StrapiStructuredData_1 = __importDefault(require("@/components/page-builder/components/seo-utilities/StrapiStructuredData"));
async function generateStaticParams() {
    if ((0, general_helpers_1.isDevelopment)()) {
        // do not prefetch all locales when developing
        return [];
    }
    const promises = navigation_2.routing.locales.map((locale) => strapi_api_1.PublicStrapiClient.fetchAll("api::page.page", { locale }));
    const results = await Promise.allSettled(promises);
    const params = results
        .filter((result) => result.status === "fulfilled")
        .flatMap((result) => result.value.data)
        .map((page) => ({
        locale: page.locale,
        rest: [page.slug],
    }));
    return params;
}
exports.generateStaticParams = generateStaticParams;
async function generateMetadata(props) {
    const params = await props.params;
    const fullPath = shared_data_1.ROOT_PAGE_PATH + (params.rest ?? []).join("/");
    return (0, metadata_1.getMetadataFromStrapi)({ fullPath, locale: params.locale });
}
exports.generateMetadata = generateMetadata;
async function StrapiPage(props) {
    const params = await props.params;
    (0, server_1.setRequestLocale)(params.locale);
    const fullPath = shared_data_1.ROOT_PAGE_PATH + (params.rest ?? []).join("/");
    const response = await (0, page_1.fetchPage)(fullPath, params.locale);
    const data = response?.data;
    if (data?.content == null) {
        (0, navigation_1.notFound)();
    }
    const { content, ...restPageData } = data;
    return (<>
      <StrapiStructuredData_1.default structuredData={data?.seo?.structuredData}/>

      <main className={(0, utils_1.cn)("flex w-full flex-col overflow-hidden")}>
        <Container_1.Container>
          <Breadcrumbs_1.Breadcrumbs breadcrumbs={response?.meta?.breadcrumbs} className="mt-6 mb-6"/>
        </Container_1.Container>

        {content
            .filter((comp) => comp != null)
            .map((comp) => {
            const name = comp.__component;
            const id = comp.id;
            const key = `${name}-${id}`;
            const Component = page_builder_1.PageContentComponents[name];
            if (Component == null) {
                console.warn(`Unknown component "${name}" with id "${id}".`);
                return (<div key={key} className="font-medium text-red-500">
                  Component &quot;{key}&quot; is not implemented on the
                  frontend.
                </div>);
            }
            // TODO: Resolve dynamic import issue with NextJS 15
            // const Component = dynamic<{
            // 	component: typeof comp
            // 	pageParams: Awaited<Props['params']>
            // 	page: typeof data
            // 	// breadcrumbs: typeof breadcrumbs
            // }>(() => import(`@/components/page-builder${componentPath}`))
            return (<ErrorBoundary_1.ErrorBoundary key={key}>
                <div className={(0, utils_1.cn)("mb-4 md:mb-12 lg:mb-16")}>
                  <Component component={comp} pageParams={params} page={restPageData}/>
                </div>
              </ErrorBoundary_1.ErrorBoundary>);
        })}
      </main>
    </>);
}
exports.default = StrapiPage;
