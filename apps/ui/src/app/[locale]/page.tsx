import { getTranslations } from "next-intl/server"
import Link from "next/link"
import ListingsView from "@/components/ui/ListingsView"

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

export default async function HomePage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const t = await getTranslations("homepage")
  const listings = await getRecentListings()
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              {t("hero.title")}
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              {t("hero.description")}
            </p>
            <div className="flex gap-4 justify-center">
              <Link
                href={`/${locale}/submit`}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t("hero.submitButton")}
              </Link>
              <Link
                href={`/${locale}/search`}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                {t("hero.searchButton")}
              </Link>
            </div>
          </div>
        </div>
      </section>
      
      {/* Recent Listings */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">
            {t("recentListings.title")}
          </h2>
          
          <ListingsView
            listings={listings}
            locale={locale}
            emptyMessage={t("recentListings.empty")}
          />
          
          {/* View All Link */}
          {listings.length > 0 && (
            <div className="text-center mt-8">
              <Link
                href={`/${locale}/search`}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                {t("recentListings.viewAll")} →
              </Link>
            </div>
          )}
        </div>
      </section>
      
      {/* Stats Section */}
      <section className="bg-white py-12 border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-gray-900">1,234</div>
              <div className="text-gray-600 mt-1">{t("stats.totalListings")}</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900">567</div>
              <div className="text-gray-600 mt-1">{t("stats.activeUsers")}</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900">890</div>
              <div className="text-gray-600 mt-1">{t("stats.totalReviews")}</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900">4.5</div>
              <div className="text-gray-600 mt-1">{t("stats.averageRating")}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}