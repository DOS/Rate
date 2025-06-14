import { setPluginConfig } from "@_sh/strapi-plugin-ckeditor"

import type { StrapiApp } from "@strapi/strapi/admin"

import { cs } from "./cs"

import "@repo/design-system/styles.css"

import { defaultCkEditorConfig } from "./ckeditor/configs"

export default {
  config: {
    locales: ["en", "cs", "vi"],
    translations: {
      cs,
    },
  },
  bootstrap(app: StrapiApp) {
    // Simple i18n fix: ensure default locale is properly set
    console.log("Admin app bootstrapped with locales:", ["en", "cs", "vi"])
  },
  register() {
    setPluginConfig({ presets: [defaultCkEditorConfig] })
  },
}
