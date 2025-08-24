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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

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

async function HomePage({ locale }: { locale: string }) {
  const t = await getTranslations("homepage")
  const listings = await getRecentListings()
  
  return (
    <div className="min-h-screen">
      {/* Hero Section with Gradient */}
      <section className="relative bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-20 lg:py-32">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center px-3 py-1 mb-6 text-sm font-medium text-blue-700 bg-blue-100 rounded-full">
              ✨ Trusted by thousands of users
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              {t("hero.title")}
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed">
              {t("hero.description")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="text-lg px-8 py-4 h-auto">
                <Link href={`/${locale}/submit`}>
                  {t("hero.submitButton")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 py-4 h-auto">
                <Link href={`/${locale}/search`}>
                  {t("hero.searchButton")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      
      {/* Stats Section with Cards */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="text-3xl lg:text-4xl font-bold text-blue-600 mb-2">1,234</div>
                <div className="text-gray-600 font-medium">{t("stats.totalListings")}</div>
              </CardContent>
            </Card>
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="text-3xl lg:text-4xl font-bold text-green-600 mb-2">567</div>
                <div className="text-gray-600 font-medium">{t("stats.activeUsers")}</div>
              </CardContent>
            </Card>
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="text-3xl lg:text-4xl font-bold text-purple-600 mb-2">890</div>
                <div className="text-gray-600 font-medium">{t("stats.totalReviews")}</div>
              </CardContent>
            </Card>
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="text-3xl lg:text-4xl font-bold text-orange-600 mb-2">4.5</div>
                <div className="text-gray-600 font-medium">{t("stats.averageRating")}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      
      {/* Recent Listings */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t("recentListings.title")}
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Discover the latest submissions from our community
            </p>
          </div>
          
          {listings.length > 0 ? (
            <>
              <ListingsView
                listings={listings}
                locale={locale}
                emptyMessage={t("recentListings.empty")}
              />
              
              <div className="text-center mt-12">
                <Button asChild variant="outline" size="lg">
                  <Link href={`/${locale}/search`}>
                    {t("recentListings.viewAll")} →
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <Card className="max-w-md mx-auto text-center">
              <CardContent className="pt-6 pb-8">
                <div className="text-6xl mb-4">📝</div>
                <CardTitle className="mb-2">{t("recentListings.empty")}</CardTitle>
                <CardDescription className="mb-6">
                  Be the first to share your experience with the community
                </CardDescription>
                <Button asChild>
                  <Link href={`/${locale}/submit`}>
                    {t("hero.submitButton")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Share Your Experience?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join our community and help others make informed decisions
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" variant="secondary" className="text-lg px-8 py-4 h-auto">
              <Link href={`/${locale}/submit`}>
                Get Started
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-lg px-8 py-4 h-auto border-white text-white hover:bg-white hover:text-blue-600">
              <Link href={`/${locale}/search`}>
                Explore Listings
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
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
    return <HomePage locale={params.locale} />
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
