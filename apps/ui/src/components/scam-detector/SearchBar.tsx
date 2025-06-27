"use client"

import { useState, useEffect } from "react"
import { Search, AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

interface SearchBarProps {
  defaultValue?: string
}

export default function ScamSearchBar({ defaultValue = "" }: SearchBarProps) {
  const [searchValue, setSearchValue] = useState(defaultValue)
  const [isSearching, setIsSearching] = useState(false)
  const router = useRouter()
  const t = useTranslations("scamDetector.search")

  // Update value when defaultValue changes
  useEffect(() => {
    setSearchValue(defaultValue)
  }, [defaultValue])

  // Tự động nhận diện loại input
  const detectSearchType = (value: string): string => {
    const trimmedValue = value.trim()
    
    // Email pattern
    if (trimmedValue.includes("@") && trimmedValue.includes(".")) {
      return "email"
    }
    
    // Website pattern
    if (trimmedValue.match(/^(https?:\/\/|www\.)/i) || trimmedValue.match(/\.(com|net|org|vn|edu|gov)/i)) {
      return "website"
    }
    
    // Phone pattern - Việt Nam và quốc tế
    if (trimmedValue.match(/^(\+?\d{1,3})?[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}$/)) {
      return "phone"
    }
    
    // Default to organization/name
    return "organization"
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchValue.trim()) return

    setIsSearching(true)
    const searchType = detectSearchType(searchValue)
    
    // Navigate to search results page
    router.push(`/scam-detector/search?q=${encodeURIComponent(searchValue)}&type=${searchType}`)
    
    // Reset searching state after a short delay to allow navigation
    setTimeout(() => {
      setIsSearching(false)
    }, 100)
  }

  return (
    <div className="max-w-4xl mx-auto px-6">
      <div className="bg-white rounded-2xl shadow-2xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          {t("title")}
        </h2>

        <form onSubmit={handleSearch} className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={t("placeholder")}
              className="w-full px-4 py-4 pr-12 text-lg border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none transition-colors"
              disabled={isSearching}
            />
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
          </div>

          <button
            type="submit"
            disabled={isSearching || !searchValue.trim()}
            className="w-full py-4 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSearching ? t("checking") : t("button")}
          </button>
        </form>

        {/* Search tips */}
        <div className="mt-6 bg-red-50 rounded-lg p-4">
          <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {t("tips.title")}
          </h3>
          <ul className="space-y-1 text-sm text-red-800">
            <li>• {t("tips.phone")} <span className="text-red-600">{t("tips.phoneExample")}</span></li>
            <li>• {t("tips.email")} <span className="text-red-600">{t("tips.emailExample")}</span></li>
            <li>• {t("tips.website")} <span className="text-red-600">{t("tips.websiteExample")}</span></li>
            <li>• {t("tips.organization")} <span className="text-red-600">{t("tips.organizationExample")}</span></li>
          </ul>
        </div>

        {/* Recent searches */}
        <div className="mt-6">
          <p className="text-sm text-gray-600 mb-2">{t("recent")}</p>
          <div className="flex flex-wrap gap-2">
            {["0909123456", "scam@fake.com", "ABC Company", "fake-website.com"].map((item) => (
              <button
                key={item}
                onClick={() => setSearchValue(item)}
                className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
} 