"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { ArrowLeft, Clock, CheckCircle, XCircle, AlertCircle, Edit, Trash2, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useParams } from "next/navigation"

const statusIcons = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  needs_revision: AlertCircle,
}

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  needs_revision: "bg-orange-100 text-orange-800",
}

export default function MySubmissionsPage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations("mySubmissions")
  const [listings, setListings] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchListings()
  }, [])

  const fetchListings = async () => {
    try {
      const response = await fetch(`/api/listings?filters[CreatedBy][id][$eq]=me&populate[0]=Item&populate[1]=Category&sort[0]=createdAt:desc`)
      
      if (response.status === 401) {
        router.push(`/${params.locale}/auth/signin?callbackUrl=/${params.locale}/my-submissions`)
        return
      }
      
      const data = await response.json()
      setListings(data.data || [])
    } catch (error) {
      console.error("Error fetching listings:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t("deleteConfirm"))) return
    
    setDeletingId(id)
    try {
      const response = await fetch(`/api/listings/${id}`, {
        method: "DELETE",
      })
      
      if (response.ok) {
        setListings(listings.filter(l => l.id !== id))
      } else {
        const error = await response.json()
        alert(error.error || "Failed to delete listing")
      }
    } catch (error) {
      console.error("Error deleting listing:", error)
      alert("Failed to delete listing")
    } finally {
      setDeletingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12">
        <div className="max-w-6xl mx-auto px-6 flex justify-center items-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href={`/${params.locale}`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("backToHome")}
          </Link>
          
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">
              {t("title")}
            </h1>
            <Link
              href={`/${params.locale}/submit`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t("submitNew")}
            </Link>
          </div>
        </div>

        {/* Listings Grid */}
        {listings.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 mb-4">{t("noSubmissions")}</p>
            <Link
              href={`/${params.locale}/submit`}
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
            >
              {t("submitFirst")}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {listings.map((listing: any) => {
              const StatusIcon = statusIcons[listing.attributes.Status] || Clock
              const statusColor = statusColors[listing.attributes.Status] || statusColors.pending
              
              return (
                <div key={listing.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {listing.attributes.Title}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                        <span>
                          {t("category")}: {listing.attributes.Category?.data?.attributes?.Name || "-"}
                        </span>
                        <span>
                          {t("item")}: {listing.attributes.Item?.data?.attributes?.Name || listing.attributes.Item?.data?.attributes?.Title || "-"}
                        </span>
                      </div>
                      
                      {/* Status Badge */}
                      <div className="inline-flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
                          <StatusIcon className="w-4 h-4" />
                          {t(`status.${listing.attributes.Status}`)}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(listing.attributes.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      
                      {/* Review Notes */}
                      {listing.attributes.ReviewNotes && (
                        <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700">
                          <strong>{t("reviewNotes")}:</strong> {listing.attributes.ReviewNotes}
                        </div>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {(listing.attributes.Status === 'pending' || listing.attributes.Status === 'needs_revision') && (
                        <Link
                          href={`/${params.locale}/my-submissions/edit/${listing.id}`}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title={t("edit")}
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                      )}
                      <button
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title={t("delete")}
                        onClick={() => handleDelete(listing.id)}
                        disabled={deletingId === listing.id}
                      >
                        {deletingId === listing.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
} 