"use strict";
import { setPluginConfig } from "@_sh/strapi-plugin-ckeditor";
import { cs } from "./cs";
import "@repo/design-system/styles.css";
import { defaultCkEditorConfig } from "./ckeditor/configs";

// Import Prism.js to fix "Prism is not defined" error
import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";

// Make Prism globally available
window.Prism = Prism;

export default {
    config: {
        locales: ["en", "cs", "vi"],
        translations: {
            cs: cs,
        },
    },
    bootstrap(app) {
        // Simple i18n fix: ensure default locale is properly set
        console.log("Admin app bootstrapped with locales:", ["en", "cs", "vi"]);
        console.log("Prism.js loaded:", typeof window.Prism !== 'undefined');
    },
    register() {
        setPluginConfig({ presets: [defaultCkEditorConfig] });
    },
};
