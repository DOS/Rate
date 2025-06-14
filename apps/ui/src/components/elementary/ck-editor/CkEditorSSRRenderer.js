"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("next-intl/server");
const node_html_parser_1 = __importDefault(require("node-html-parser"));
const utils_1 = require("@/lib/utils");
const utils_2 = require("@/components/elementary/ck-editor/utils");
const CkEditorSSRRenderer = async ({ htmlContent, className, variant = "page", }) => {
    const locale = await (0, server_1.getLocale)();
    const processHtmlContent = (html, locale) => {
        // Create a DOM parser to work with the HTML content
        const doc = (0, node_html_parser_1.default)(html);
        // Find all anchor tags
        const links = doc.getElementsByTagName("a");
        // Update each link's href with the locale prefix
        for (const link of links) {
            const href = link.getAttribute("href");
            if (href?.startsWith("/")) {
                link.setAttribute("href", (0, utils_2.processLinkHrefAttribute)(href, locale));
            }
        }
        const tagNames = ["h1", "h2", "h3", "h4", "h5", "h6", "p"];
        for (const tagName of tagNames) {
            const elements = doc.getElementsByTagName(tagName);
            for (const element of elements) {
                element.classList.add(`typo-${tagName}`);
            }
        }
        return doc.innerHTML;
    };
    return htmlContent ? (<div className={(0, utils_1.cn)(variant === "page" ? "ck-editor-rich-text-page" : "", className)} 
    // Content is coming from Strapi, i.e. from employees, not users
    dangerouslySetInnerHTML={{
            __html: htmlContent ? processHtmlContent(htmlContent, locale) : "",
        }}/>) : null;
};
exports.default = CkEditorSSRRenderer;
