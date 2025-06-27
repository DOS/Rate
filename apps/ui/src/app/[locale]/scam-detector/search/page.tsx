import { setRequestLocale } from "next-intl/server"
import { useTranslations } from "next-intl"
import { Suspense } from "react"
import type { PageProps } from "@/types/next"
import { fetchScammerItemsDirect } from "@/lib/strapi-api/content/item"
import ScamSearchBar from "@/components/scam-detector/SearchBar"
import SearchResults from "@/components/scam-detector/SearchResults"

type Props = PageProps<{}, { q?: string; type?: string }>

export default async function ScamSearchResultsPage(props: Props) {
  const params = await props.params
  const searchParams = await props.searchParams
  
  setRequestLocale(params.locale)
  
  const query = searchParams.q || ""
  const searchType = searchParams.type || "all"
  
  // Fetch all items for now - later we'll add search filters
  const allItems = await fetchScammerItemsDirect(params.locale, 1, 100)
  
  // Simple client-side filtering for now
  const filteredResults = query ? allItems.data?.filter((item: any) => {
    const searchLower = query.toLowerCase()
    const name = (item.attributes?.Name || item.attributes?.Title || "").toLowerCase()
    const description = (item.attributes?.Description?.[0]?.children?.[0]?.text || "").toLowerCase()
    const email = (item.attributes?.BasicContact?.Email || "").toLowerCase()
    const phone = (item.attributes?.BasicContact?.Phone || "").toLowerCase()
    const website = (item.attributes?.BasicContact?.Website || "").toLowerCase()
    
    // Search in all fields
    return name.includes(searchLower) ||
           description.includes(searchLower) ||
           email.includes(searchLower) ||
           phone.includes(searchLower) ||
           website.includes(searchLower)
  }) : []

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12">
      <div className="max-w-7xl mx-auto px-6">
        {/* Search Bar */}
        <div className="mb-12">
          <ScamSearchBar defaultValue={query} />
        </div>
        
        {/* Search Results */}
        <Suspense fallback={<div>Loading...</div>}>
          <SearchResults 
            query={query} 
            searchType={searchType}
            results={filteredResults || []}
            totalCount={filteredResults?.length || 0}
          />
        </Suspense>
      </div>
    </div>
  )
} 