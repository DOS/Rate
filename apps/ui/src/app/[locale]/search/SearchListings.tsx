"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, Filter } from "lucide-react"
import { useTranslations } from "next-intl"
import ListingsView from "@/components/ui/ListingsView"

interface SearchListingsProps {
  initialListings: any[]
  locale: string
  searchParams: {
    q?: string
    category?: string
    sort?: string
  }
}

export default function SearchListings({ initialListings, locale, searchParams }: SearchListingsProps) {
  const t = useTranslations("search")
  const router = useRouter()
  const urlSearchParams = useSearchParams()
  
  const [searchQuery, setSearchQuery] = useState(searchParams.q || "")
  const [selectedCategory, setSelectedCategory] = useState(searchParams.category || "")
  const [sortBy, setSortBy] = useState(searchParams.sort || "createdAt:desc")
  const [categories, setCategories] = useState<any[]>([])
  
  useEffect(() => {
    fetchCategories()
  }, [])
  
  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories")
      const data = await response.json()
      setCategories(data.data || [])
    } catch (error) {
      console.error("Error fetching categories:", error)
    }
  }
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateSearchParams()
  }
  
  const updateSearchParams = () => {
    const params = new URLSearchParams()
    
    if (searchQuery) params.set("q", searchQuery)
    if (selectedCategory) params.set("category", selectedCategory)
    if (sortBy !== "createdAt:desc") params.set("sort", sortBy)
    
    router.push(`/${locale}/search?${params.toString()}`)
  }
  
  useEffect(() => {
    updateSearchParams()
  }, [selectedCategory, sortBy])
  
  return (
    <div>
      {/* Search Form */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={t("selectCategory")}
          >
            <option value="">{t("allCategories")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.attributes.Name}
              </option>
            ))}
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={t("sortBy.label")}
          >
            <option value="createdAt:desc">{t("sortBy.newest")}</option>
            <option value="createdAt:asc">{t("sortBy.oldest")}</option>
            <option value="Title:asc">{t("sortBy.titleAZ")}</option>
            <option value="Title:desc">{t("sortBy.titleZA")}</option>
            <option value="ViewCount:desc">{t("sortBy.mostViewed")}</option>
          </select>
          
          <button
            type="submit"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {t("searchButton")}
          </button>
        </div>
      </form>
      
      {/* Search Results Count */}
      {searchParams.q && (
        <div className="mb-6">
          <p className="text-gray-600">
            {t("resultsFound", { count: initialListings.length, query: searchParams.q })}
          </p>
        </div>
      )}
      
      {/* Listings with toggle view */}
      <ListingsView
        listings={initialListings}
        locale={locale}
        emptyMessage={t("noResults")}
      />
    </div>
  )
} 