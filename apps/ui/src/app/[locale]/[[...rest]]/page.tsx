import { notFound } from "next/navigation"
import { ROOT_PAGE_PATH } from "@repo/shared-data"
import { setRequestLocale } from "next-intl/server"
import { getTranslations } from "next-intl/server"
import Link from "next/link"

import type { PageProps } from "@/types/next"

import { isDevelopment } from "@/lib/general-helpers"
import { getMetadataFromStrapi } from "@/lib/metadata"
import { routing } from "@/lib/navigation"
import { PublicStrapiClient } from "@/lib/strapi-api"
import { fetchPage } from "@/lib/strapi-api/content/page"
import { cn } from "@/lib/utils"
import { Breadcrumbs } from "@/components/elementary/Breadcrumbs"
import { Container } from "@/components/elementary/Container"
import { ErrorBoundary } from "@/components/elementary/ErrorBoundary"
import { PageContentComponents } from "@/components/page-builder"
import StrapiStructuredData from "@/components/page-builder/components/seo-utilities/StrapiStructuredData"
import ListingsView from "@/components/ui/ListingsView"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
// Salient landing components
// Radiant sections
import type RadiantHome from "./page.radiant"

async function getRecentListings() {
  const strapiUrl = process.env.STRAPI_API_URL || "http://localhost:1337"
  const strapiToken = process.env.STRAPI_API_TOKEN
  
  try {
    const response = await fetch(
      `${strapiUrl}/api/listings?filters[Status][$eq]=approved&populate[0]=Item.Media&populate[1]=Category&populate[2]=CreatedBy&sort[0]=createdAt:desc&pagination[limit]=12`,
      {
        headers: {
          Authorization: `Bearer ${strapiToken}`,
        },
        next: { revalidate: 60 }, // Cache for 60 seconds
      }
    )
    
    if (!response.ok) {
      return []
    }
    
    const data = await response.json()
    return data.data || []
  } catch (error) {
    console.error("Error fetching listings:", error)
    return []
  }
}

async function HomePage() {
  // Render the exact Radiant template to guarantee 1:1 parity
  const Component = (await import('./page.radiant')).default as typeof RadiantHome
  // @ts-expect-error Server Component interop
  return <Component />
}

export async function generateStaticParams() {
  if (isDevelopment()) {
    // do not prefetch all locales when developing
    return []
  }

  const promises = routing.locales.map((locale) =>
    PublicStrapiClient.fetchAll("api::page.page", { locale })
  )

  const results = await Promise.allSettled(promises)

  const params = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value.data)
    .map((page) => ({
      locale: page.locale,
      rest: [page.slug],
    }))

  return params
}

type Props = PageProps<{
  rest: string[]
}>

export async function generateMetadata(props: Props) {
  const params = await props.params
  
  // If no rest params, this is homepage
  if (!params.rest || params.rest.length === 0) {
    return {
      title: "Homepage", // Can be improved with proper i18n
    }
  }
  
  const fullPath = ROOT_PAGE_PATH + params.rest.join("/")
  return getMetadataFromStrapi({ fullPath, locale: params.locale })
}

export default async function StrapiPage(props: Props) {
  const params = await props.params

  setRequestLocale(params.locale)

  // If no rest params or empty array, show homepage
  if (!params.rest || params.rest.length === 0) {
    return <HomePage />
  }

  // Otherwise, handle as dynamic Strapi page
  const fullPath = ROOT_PAGE_PATH + params.rest.join("/")
  const response = await fetchPage(fullPath, params.locale)

  const data = response?.data

  if (data?.content == null) {
    notFound()
  }

  const { content, ...restPageData } = data

  return (
    <>
      <StrapiStructuredData structuredData={data?.seo?.structuredData} />

      <main className={cn("flex w-full flex-col overflow-hidden")}>
        <Container>
          <Breadcrumbs
            breadcrumbs={response?.meta?.breadcrumbs}
            className="mt-6 mb-6"
          />
        </Container>

        {content
          .filter((comp) => comp != null)
          .map((comp) => {
            const name = comp.__component
            const id = comp.id
            const key = `${name}-${id}`
            const Component = PageContentComponents[name]
            if (Component == null) {
              console.warn(`Unknown component "${name}" with id "${id}".`)

              return (
                <div key={key} className="font-medium text-red-500">
                  Component &quot;{key}&quot; is not implemented on the
                  frontend.
                </div>
              )
            }

            return (
              <ErrorBoundary key={key}>
                <div className={cn("mb-4 md:mb-12 lg:mb-16")}>
                  <Component
                    component={comp}
                    pageParams={params}
                    page={restPageData}
                  />
                </div>
              </ErrorBoundary>
            )
          })}
      </main>
    </>
  )
}
