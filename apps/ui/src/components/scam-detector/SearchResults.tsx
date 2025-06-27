"use client"

import { AlertTriangle, Building2, Mail, Phone, Globe, Calendar, Shield } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"

interface SearchResultsProps {
  query: string
  searchType: string
  results: any[]
  totalCount: number
}

export default function SearchResults({ query, searchType, results, totalCount }: SearchResultsProps) {
  const t = useTranslations("scamDetector.searchResults")

  if (!query) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">{t("enterQuery")}</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <Shield className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">{t("noResults.title")}</h3>
        <p className="text-gray-600 max-w-md mx-auto">
          {t("noResults.description", { query })}
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Results header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {t("foundResults", { count: totalCount, query })}
        </h2>
        <p className="text-gray-600 mt-1">
          {t("searchType", { type: t(`types.${searchType}`) })}
        </p>
      </div>

      {/* Results list */}
      <div className="space-y-6">
        {results.map((item: any) => {
          const riskLevel = item.attributes?.RiskLevel || "medium"
          const riskColors = {
            high: "bg-red-100 text-red-800 border-red-200",
            medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
            low: "bg-green-100 text-green-800 border-green-200"
          }

          return (
            <div 
              key={item.id} 
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border-l-4 border-red-500"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {item.attributes?.BasicInfo?.Name || item.attributes?.Title || t("unknownEntity")}
                  </h3>
                  
                  {/* Contact info */}
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-3">
                    {item.attributes?.BasicContact?.Email && (
                      <div className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        <span>{item.attributes.BasicContact.Email}</span>
                      </div>
                    )}
                    {item.attributes?.BasicContact?.Phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        <span>{item.attributes.BasicContact.Phone}</span>
                      </div>
                    )}
                    {item.attributes?.BasicContact?.Website && (
                      <div className="flex items-center gap-1">
                        <Globe className="w-4 h-4" />
                        <span>{item.attributes.BasicContact.Website}</span>
                      </div>
                    )}
                    {item.attributes?.BasicInfo?.Type && (
                      <div className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        <span>{item.attributes.BasicInfo.Type}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Risk badge */}
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${riskColors[riskLevel]} border`}>
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {t(`risk.${riskLevel}`)}
                  </div>
                </div>
              </div>

              {/* Description */}
              {item.attributes?.Description?.[0]?.children?.[0]?.text && (
                <p className="text-gray-700 mb-4 line-clamp-2">
                  {item.attributes.Description[0].children[0].text}
                </p>
              )}

              {/* Stats */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(item.attributes?.createdAt).toLocaleDateString()}
                  </div>
                  {item.attributes?.ReportCount && (
                    <span>{t("reports", { count: item.attributes.ReportCount })}</span>
                  )}
                </div>

                <Link 
                  href={`/scam-detector/detail/${item.id}`}
                  className="text-red-600 hover:text-red-700 font-medium text-sm"
                >
                  {t("viewDetails")} →
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
} 