"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const next_intl_1 = require("next-intl");
const utils_1 = require("@/lib/utils");
const utils_2 = require("@/components/elementary/ck-editor/utils");
const CkEditorCSRRenderer = ({ htmlContent, className, variant = "page", }) => {
    const locale = (0, next_intl_1.useLocale)();
    const processedHtmlContent = (0, react_1.useMemo)(() => {
        if (!htmlContent)
            return "";
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, "text/html");
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
        return doc.body.innerHTML;
    }, [htmlContent, locale]);
    return htmlContent ? (<div className={(0, utils_1.cn)(variant === "page" ? "ck-editor-rich-text-page" : "", className)} 
    // Content is coming from Strapi, i.e. from employees, not users
    dangerouslySetInnerHTML={{
            __html: processedHtmlContent,
        }}/>) : null;
};
exports.default = CkEditorCSRRenderer;
