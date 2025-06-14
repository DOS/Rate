"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_ENDPOINTS = void 0;
const general_helpers_1 = require("@/lib/general-helpers");
// Add endpoints here that are queried from the frontend.
// Mapping of Strapi content type UIDs to API endpoint paths.
// eslint-disable-next-line no-unused-vars
exports.API_ENDPOINTS = {
    "api::page.page": "/pages",
    "api::footer.footer": "/footer",
    "api::navbar.navbar": "/navbar",
    "api::subscriber.subscriber": "/subscribers",
};
class BaseStrapiClient {
    async fetchAPI(path, params = {}, requestInit, options) {
        const { url, headers } = await this.prepareRequest(path, {
            ...params,
            ...(options?.doNotAddLocaleQueryParams
                ? {}
                : { locale: params.locale }),
        }, options);
        const response = await fetch(url, {
            ...requestInit,
            next: {
                ...requestInit?.next,
                // if revalidate is set to a number since 0 implies cache: 'no-store' and a positive value implies cache: 'force-cache'.
                revalidate: (0, general_helpers_1.isDevelopment)() ? 0 : requestInit?.next?.revalidate ?? 60,
            },
            headers: {
                ...requestInit?.headers,
                ...headers,
            },
        });
        const { json, text } = await this.parseResponse(response);
        if (text) {
            const appError = {
                name: "Invalid response format",
                message: text,
                status: response.status,
            };
            console.error("[BaseStrapiClient] Strapi API request error: ", appError);
            throw new Error(JSON.stringify(appError));
        }
        if (!response.ok) {
            const { error } = json;
            const appError = {
                name: error?.name,
                message: error?.message,
                details: error?.details,
                status: response.status ?? error?.status,
            };
            console.error("[BaseStrapiClient] Strapi API request error: ", appError);
            throw new Error(JSON.stringify(appError));
        }
        return json;
    }
    /**
     * Fetches one document by ID or Single type (without ID)
     */
    async fetchOne(uid, documentId, params, requestInit, options) {
        const path = this.getStrapiApiPathByUId(uid);
        const url = `${path}${documentId ? `/${documentId}` : ""}`;
        return await this.fetchAPI(url, params, requestInit, options);
    }
    /**
     * Fetches multiple documents
     */
    async fetchMany(uid, params, requestInit, options) {
        const path = this.getStrapiApiPathByUId(uid);
        return await this.fetchAPI(path, params, requestInit, options);
    }
    /**
     * Fetches all documents
     */
    async fetchAll(uid, params, requestInit, options) {
        const path = this.getStrapiApiPathByUId(uid);
        // Strapi can be configured in https://docs.strapi.io/dev-docs/configurations/api
        const maxPageSize = 100;
        const firstPage = await this.fetchAPI(path, { ...params, pagination: { page: 1, pageSize: maxPageSize } }, requestInit, options);
        if (firstPage.meta.pagination.pageCount === 1) {
            return firstPage;
        }
        const otherPages = Array.from({ length: firstPage.meta.pagination.pageCount - 1 }, (_, i) => this.fetchAPI(path, {
            ...params,
            pagination: {
                ...firstPage.meta.pagination,
                page: i + 2,
                pageSize: maxPageSize,
            },
        }, requestInit, options));
        return Promise.all(otherPages).then((res) => ({
            data: [firstPage.data, ...res.map((page) => page.data)].flat(),
            meta: {
                pagination: {
                    page: 1,
                    pageCount: 1,
                    pageSize: firstPage.meta.pagination.total,
                    total: firstPage.meta.pagination.total,
                },
            },
        }));
    }
    /**
     * Fetches a single entity by slug
     */
    async fetchOneBySlug(uid, slug, params, requestInit, options) {
        const slugFilter = slug && slug.length > 0 ? { $eq: slug } : { $null: true };
        const mergedParams = {
            ...params,
            sort: { publishedAt: "desc" },
            filters: { ...params?.filters, slug: slugFilter },
        };
        const path = this.getStrapiApiPathByUId(uid);
        const response = await this.fetchAPI(path, mergedParams, requestInit, options);
        // return last published entry
        return {
            data: response.data.pop() ?? null,
            meta: {},
        };
    }
    /**
     * Fetches a single entity by full path
     */
    async fetchOneByFullPath(uid, fullPath, params, requestInit, options) {
        const slugFilter = fullPath && fullPath.length > 0 ? { $eq: fullPath } : { $null: true };
        const mergedParams = {
            ...params,
            sort: { publishedAt: "desc" },
            filters: { ...params?.filters, fullPath: slugFilter },
        };
        const path = this.getStrapiApiPathByUId(uid);
        const response = await this.fetchAPI(path, mergedParams, requestInit, options);
        // return last published entry
        return {
            // @ts-expect-error localizations TODO @dominik-juriga
            data: response.data.pop() ?? null,
            meta: response.meta,
        };
    }
    /**
     * Get Path of the API route by UID
     * @param uid - UID of the Endpoint
     * @returns API Endpoint path
     */
    getStrapiApiPathByUId(uid) {
        const path = exports.API_ENDPOINTS[uid];
        if (path) {
            return path;
        }
        throw new Error(`Endpoint for UID "${uid}" not found. Extend API_ENDPOINTS in lib/api/client.ts.`);
    }
    async parseResponse(response) {
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
            return {
                contentType,
                json: await response.json(),
            };
        }
        return {
            contentType,
            text: await response.text(),
        };
    }
}
exports.default = BaseStrapiClient;
