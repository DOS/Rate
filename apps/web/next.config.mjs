import withPlaiceholder from "@plaiceholder/next"
// @sentry/nextjs 11 exposes the build wrapper from the "/config" subpath only
import { withSentryConfig } from "@sentry/nextjs/config"
import plugin from "next-intl/plugin"
import path from "path"
import { fileURLToPath } from "url"

import { env } from "./src/env.mjs"

const withNextIntl = plugin("./src/i18n/request.ts")

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: env.NEXT_OUTPUT || undefined,
  reactStrictMode: true,
  // No X-Powered-By: it only advertises the framework.
  poweredByHeader: false,
  // React Compiler (stable in Next.js 16) memoizes components and hooks at build time.
  reactCompiler: true,
  experimental: { externalDir: true },
  transpilePackages: ["@repo/design-system"],
  turbopack: {
    resolveAlias: {
      "next-intl/config": "./src/i18n/request.ts",
    },
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow alternate dev origins (localhost, 127.0.0.1, LAN IP, MCP)
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.50.99:3000",
    "http://host.docker.internal:3000",
  ],
  images: {
    // Be aware that Strapi has optimization on by default
    // Do not optimize all images by default.
    // This is because the optimization process can be slow and resource-intensive. Instead, only optimize images that are requested by the browser.
    unoptimized: true,

    // AVIF generally takes 20% longer to encode but it compresses 20% smaller compared to WebP.
    // This means that the first time an image is requested, it will typically be slower and then subsequent requests that are cached will be faster.
    formats: ["image/webp" /* 'image/avif' */],

    // The optimized image file will be served for subsequent requests until the expiration is reached.
    // When a request is made that matches a cached but expired file, the expired image is served stale immediately.
    // Then the image is optimized again in the background (also called revalidation) and saved to the cache with the new expiration date.
    minimumCacheTTL: 60 * 15, // 15 minutes - after this time, the image will be revalidated

    // You can configure deviceSizes or imageSizes to reduce the total number of possible generated images.
    // Please check: https://nextjs.org/docs/14/app/api-reference/components/image#imagesizes
    deviceSizes: [420, 768, 1024],

    remotePatterns: [
      {
        protocol: "https",
        hostname: "*",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
      },
    ],
  },

  webpack: (config, { dev }) => {
    if (config.cache && !dev) {
      // Switching between memory and filesystem cache
      // Memory cache is faster and can be beneficial in environments with slow or limited disk access,
      // but it isn't persistent across builds and requires higher memory usage.
      // Filesystem cache survives across builds but may cause large `.next/cache` folder.
      config.cache = Object.freeze({
        type: env.WEBPACK_CACHE_TYPE || "filesystem",
      })
    }
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "next-intl/config": path.resolve(__dirname, "src/i18n/request.ts"),
    }
    return config
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none';",
          },
        ],
      },
    ]
  },

  // iOS asks for these paths on its own; the 180px icon from
  // app/apple-icon.png is served at /apple-icon.png (DOS/Rate#732).
  async rewrites() {
    return [
      { source: "/apple-touch-icon.png", destination: "/apple-icon.png" },
      {
        source: "/apple-touch-icon-precomposed.png",
        destination: "/apple-icon.png",
      },
    ]
  },
}

const withConfig = (() => {
  let config = withNextIntl(withPlaiceholder(nextConfig))

  // Only enable Sentry webpack wrapping when DSN is provided (e.g., in CI/production)
  if (!env.NEXT_PUBLIC_SENTRY_DSN) {
    return config
  }

  config = withSentryConfig(config, {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // Pass org, project and auth token to be able to upload source maps
    org: env.SENTRY_ORG,
    project: env.SENTRY_PROJECT,
    authToken: env.SENTRY_AUTH_TOKEN,

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Automatically annotate React components to show their full name in breadcrumbs and session replay
    reactComponentAnnotation: {
      enabled: true,
    },

    // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    // tunnelRoute: "/monitoring",

    // Generated source maps are deleted after upload by default
    // (sourcemaps.deleteSourcemapsAfterUpload), which replaces the removed hideSourceMaps option.

    // Tree-shake Sentry SDK logger statements (replaces the removed disableLogger option; webpack builds only)
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
  })
  return config
})()

export default withConfig
