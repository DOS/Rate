import "@/styles/tailwind.css"

import { Metadata } from "next"
import { notFound } from "next/navigation"
import { setRequestLocale } from "next-intl/server"

import { LayoutProps } from "@/types/next"

import { fontRoboto } from "@/lib/fonts"
import { routing } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { ErrorBoundary } from "@/components/elementary/ErrorBoundary"
import StrapiPreviewListener from "@/components/elementary/StrapiPreviewListener"
import { TailwindIndicator } from "@/components/elementary/TailwindIndicator"
// Swap to Radiant layout components
import { ClientProviders } from "@/components/providers/ClientProviders"
import { ServerProviders } from "@/components/providers/ServerProviders"
import TrackingScripts from "@/components/providers/TrackingScripts"
import { Toaster } from "@/components/ui/toaster"

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export const metadata: Metadata = {
  title: {
    template: "%s / Notum Technologies",
    default: "",
  },
}

export default async function RootLayout({ children, params }: LayoutProps) {
  const { locale } = await params

  if (!routing.locales.includes(locale)) {
    notFound()
  }

  // Enable static rendering
  // https://next-intl-docs.vercel.app/docs/getting-started/app-router/with-i18n-routing#static-rendering
  setRequestLocale(locale)

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/css?f%5B%5D=switzer@400,500,600,700&display=swap"
        />
      </head>
      <body className={cn("antialiased text-gray-950") }>
        <StrapiPreviewListener />
        <TrackingScripts />
        <ServerProviders params={params}>
          <ClientProviders>
            <div className="relative flex min-h-screen flex-col">
              <div className="flex-1">{children}</div>

              <TailwindIndicator />
              <Toaster />
            </div>
          </ClientProviders>
        </ServerProviders>
      </body>
    </html>
  )
}
