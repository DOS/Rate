"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { ArrowLeft, Clock, CheckCircle, XCircle, AlertCircle, Eye, Check, X, MessageSquare, Loader2 } from "lucide-react"
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

export default function AdminSubmissionsPage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations("adminSubmissions")
  const [listings, setListings] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [selectedListing, setSelectedListing] = useState<any>(null)
  const [reviewNotes, setReviewNotes] = useState("")

  useEffect(() => {
    fetchListings()
  }, [selectedStatus])

  const fetchListings = async () => {
    try {
      let url = `/api/listings?populate[0]=Item&populate[1]=Category&populate[2]=CreatedBy&sort[0]=createdAt:desc`
      
      if (selectedStatus !== "all") {
        url += `&filters[Status][$eq]=${selectedStatus}`
      }
      
      const response = await fetch(url)
      
      if (response.status === 401) {
        router.push(`/${params.locale}/auth/signin?callbackUrl=/${params.locale}/admin/submissions`)
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

  const updateListingStatus = async (id: string, status: string, notes?: string) => {
    setProcessingId(id)
    try {
      const body: any = {
        data: {
          Status: status,
        }
      }
      
      if (notes) {
        body.data.ReviewNotes = notes
      }
      
      const response = await fetch(`/api/listings/${id}/admin`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
      
      if (response.ok) {
        await fetchListings()
        setShowReviewModal(false)
        setReviewNotes("")
        setSelectedListing(null)
      } else {
        const error = await response.json()
        alert(error.error || "Failed to update listing")
      }
    } catch (error) {
      console.error("Error updating listing:", error)
      alert("Failed to update listing")
    } finally {
      setProcessingId(null)
    }
  }

  const handleReview = (listing: any, status: string) => {
    if (status === 'rejected' || status === 'needs_revision') {
      setSelectedListing(listing)
      setShowReviewModal(true)
    } else {
      updateListingStatus(listing.id, status)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12">
        <div className="max-w-7xl mx-auto px-6 flex justify-center items-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href={`/${params.locale}`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("backToHome")}
          </Link>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {t("title")}
          </h1>
          
          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedStatus("all")}
              className={`px-4 py-2 rounded ${selectedStatus === "all" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {t("filter.all")}
            </button>
            <button
              onClick={() => setSelectedStatus("pending")}
              className={`px-4 py-2 rounded ${selectedStatus === "pending" ? "bg-yellow-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {t("filter.pending")}
            </button>
            <button
              onClick={() => setSelectedStatus("approved")}
              className={`px-4 py-2 rounded ${selectedStatus === "approved" ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {t("filter.approved")}
            </button>
            <button
              onClick={() => setSelectedStatus("rejected")}
              className={`px-4 py-2 rounded ${selectedStatus === "rejected" ? "bg-red-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {t("filter.rejected")}
            </button>
          </div>
        </div>

        {/* Listings Table */}
        {listings.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">{t("noSubmissions")}</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("table.listing")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("table.submittedBy")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("table.status")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("table.date")}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {listings.map((listing: any) => {
                  const StatusIcon = statusIcons[listing.attributes.Status] || Clock
                  const statusColor = statusColors[listing.attributes.Status] || statusColors.pending
                  
                  return (
                    <tr key={listing.id}>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {listing.attributes.Title}
                          </div>
                          <div className="text-sm text-gray-500">
                            {listing.attributes.Category?.data?.attributes?.Name} - {listing.attributes.Item?.data?.attributes?.Name || listing.attributes.Item?.data?.attributes?.Title}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {listing.attributes.CreatedBy?.data?.attributes?.username || "Unknown"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {listing.attributes.CreatedBy?.data?.attributes?.email}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
                          <StatusIcon className="w-4 h-4" />
                          {t(`status.${listing.attributes.Status}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(listing.attributes.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/${params.locale}/listings/${listing.id}`}
                            className="text-gray-600 hover:text-gray-900"
                            title={t("view")}
                          >
                            <Eye className="w-5 h-5" />
                          </Link>
                          {listing.attributes.Status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleReview(listing, 'approved')}
                                className="text-green-600 hover:text-green-900 disabled:opacity-50"
                                title={t("approve")}
                                disabled={processingId === listing.id}
                              >
                                <Check className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => handleReview(listing, 'rejected')}
                                className="text-red-600 hover:text-red-900 disabled:opacity-50"
                                title={t("reject")}
                                disabled={processingId === listing.id}
                              >
                                <X className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => handleReview(listing, 'needs_revision')}
                                className="text-orange-600 hover:text-orange-900 disabled:opacity-50"
                                title={t("requestRevision")}
                                disabled={processingId === listing.id}
                              >
                                <MessageSquare className="w-5 h-5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Review Modal */}
        {showReviewModal && selectedListing && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-4">{t("reviewModal.title")}</h3>
              <textarea
                className="w-full p-3 border rounded-lg"
                rows={4}
                placeholder={t("reviewModal.placeholder")}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => {
                    const status = reviewNotes ? 'needs_revision' : 'rejected'
                    updateListingStatus(selectedListing.id, status, reviewNotes)
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  {t("reviewModal.submit")}
                </button>
                <button
                  onClick={() => {
                    setShowReviewModal(false)
                    setReviewNotes("")
                    setSelectedListing(null)
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  {t("reviewModal.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 