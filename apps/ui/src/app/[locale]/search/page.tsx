import { getTranslations } from "next-intl/server"
import SearchListings from "./SearchListings"

export default async function SearchPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string }
  searchParams: { q?: string; category?: string; sort?: string }
}) {
  const t = await getTranslations("search")
  
  async function searchListings() {
    const strapiUrl = process.env.STRAPI_API_URL || "http://localhost:1337"
    const strapiToken = process.env.STRAPI_API_TOKEN
    
    try {
      let url = `${strapiUrl}/api/listings?filters[Status][$eq]=approved&populate[0]=Item.Media&populate[1]=Category&populate[2]=CreatedBy&sort[0]=createdAt:desc`
      
      // Add search filters
      if (searchParams.q) {
        url += `&filters[$or][0][Title][$containsi]=${searchParams.q}&filters[$or][1][Description][$containsi]=${searchParams.q}`
      }
      
      if (searchParams.category) {
        url += `&filters[Category][id][$eq]=${searchParams.category}`
      }
      
      if (searchParams.sort) {
        // Override default sort
        url = url.replace('sort[0]=createdAt:desc', `sort[0]=${searchParams.sort}`)
      }
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${strapiToken}`,
        },
        next: { revalidate: 60 }, // Cache for 60 seconds
      })
      
      if (!response.ok) {
        return []
      }
      
      const data = await response.json()
      return data.data || []
    } catch (error) {
      console.error("Error searching listings:", error)
      return []
    }
  }
  
  const listings = await searchListings()
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{t("title")}</h1>
        
        <SearchListings 
          initialListings={listings}
          locale={locale}
          searchParams={searchParams}
        />
      </div>
    </div>
  )
} 