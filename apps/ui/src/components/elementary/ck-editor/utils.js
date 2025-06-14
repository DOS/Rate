"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processLinkHrefAttribute = void 0;
const processLinkHrefAttribute = (href, locale) => `/${locale}${href.startsWith("/") ? "" : "/"}${href}`;
exports.processLinkHrefAttribute = processLinkHrefAttribute;
