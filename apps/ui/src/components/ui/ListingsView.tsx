"use client"

import { useState } from "react"
import Link from "next/link"
import { Calendar, Eye, Tag, Grid3x3, List, Star } from "lucide-react"
import { useTranslations } from "next-intl"

interface ListingsViewProps {
  listings: any[]
  locale: string
  emptyMessage: string
}

export default function ListingsView({ listings, locale, emptyMessage }: ListingsViewProps) {
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const t = useTranslations("listingsView")
  
  if (listings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    )
  }
  
  return (
    <div>
      {/* View Mode Toggle */}
      <div className="flex justify-end mb-6">
        <div className="bg-white border rounded-lg p-1 flex gap-1">
          <button
            onClick={() => setViewMode("card")}
            className={`px-3 py-2 rounded-md transition-colors flex items-center gap-2 ${
              viewMode === "card"
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title={t("cardView")}
          >
            <Grid3x3 className="w-4 h-4" />
            <span className="hidden sm:inline">{t("cardView")}</span>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`px-3 py-2 rounded-md transition-colors flex items-center gap-2 ${
              viewMode === "list"
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title={t("listView")}
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">{t("listView")}</span>
          </button>
        </div>
      </div>
      
      {/* Card View */}
      {viewMode === "card" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((listing: any) => {
            const item = listing.attributes.Item?.data?.attributes
            const category = listing.attributes.Category?.data?.attributes
            const imageUrl = item?.Media?.data?.[0]?.attributes?.url
            
            return (
              <Link
                key={listing.id}
                href={`/${locale}/listings/${listing.id}`}
                className="group"
              >
                <div className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow h-full">
                  {/* Image */}
                  {imageUrl && (
                    <div className="aspect-w-16 aspect-h-9 bg-gray-200 rounded-t-lg overflow-hidden">
                      <img
                        src={`${process.env.NEXT_PUBLIC_STRAPI_URL || 'http://localhost:1337'}${imageUrl}`}
                        alt={listing.attributes.Title}
                        className="w-full h-48 object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                  )}
                  
                  {/* Content */}
                  <div className="p-4">
                    {/* Category */}
                    {category && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <Tag className="w-4 h-4" />
                        <span>{category.Name}</span>
                      </div>
                    )}
                    
                    {/* Title */}
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                      {listing.attributes.Title}
                    </h3>
                    
                    {/* Description */}
                    {listing.attributes.Description && (
                      <p
                        className="text-gray-600 text-sm line-clamp-2 mb-3"
                        dangerouslySetInnerHTML={{
                          __html: listing.attributes.Description
                            .replace(/<[^>]*>/g, '')
                            .slice(0, 100) + '...'
                        }}
                      />
                    )}
                    
                    {/* Meta Info */}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {new Date(listing.attributes.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        <span>{listing.attributes.ViewCount || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
      
      {/* List View */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {listings.map((listing: any) => {
            const item = listing.attributes.Item?.data?.attributes
            const category = listing.attributes.Category?.data?.attributes
            const imageUrl = item?.Media?.data?.[0]?.attributes?.url
            
            return (
              <Link
                key={listing.id}
                href={`/${locale}/listings/${listing.id}`}
                className="group block"
              >
                <div className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow p-4">
                  <div className="flex gap-4">
                    {/* Image */}
                    {imageUrl && (
                      <div className="flex-shrink-0">
                        <img
                          src={`${process.env.NEXT_PUBLIC_STRAPI_URL || 'http://localhost:1337'}${imageUrl}`}
                          alt={listing.attributes.Title}
                          className="w-24 h-24 object-cover rounded-lg"
                        />
                      </div>
                    )}
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {/* Category */}
                          {category && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                              <Tag className="w-4 h-4" />
                              <span>{category.Name}</span>
                            </div>
                          )}
                          
                          {/* Title */}
                          <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                            {listing.attributes.Title}
                          </h3>
                          
                          {/* Description */}
                          {listing.attributes.Description && (
                            <p
                              className="text-gray-600 text-sm line-clamp-2"
                              dangerouslySetInnerHTML={{
                                __html: listing.attributes.Description
                                  .replace(/<[^>]*>/g, '')
                                  .slice(0, 150) + '...'
                              }}
                            />
                          )}
                        </div>
                        
                        {/* Status Badge */}
                        <div className="ml-4 flex-shrink-0">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            listing.attributes.Status === 'approved' 
                              ? 'bg-green-100 text-green-800'
                              : listing.attributes.Status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {listing.attributes.Status}
                          </span>
                        </div>
                      </div>
                      
                      {/* Meta Info */}
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {new Date(listing.attributes.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          <span>{listing.attributes.ViewCount || 0}</span>
                        </div>
                        {/* Rating if available */}
                        {listing.attributes.AverageRating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                            <span>{listing.attributes.AverageRating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
} 