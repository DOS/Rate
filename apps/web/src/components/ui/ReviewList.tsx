"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Star, ThumbsUp, ThumbsDown, User, CheckCircle } from "lucide-react"
import ReviewForm from "@/components/forms/ReviewForm"
import { formatDistanceToNow } from "date-fns"

interface Review {
  id: string
  attributes: {
    Title: string
    Description: any[] // Rich text
    Rating: number
    Pros?: string
    Cons?: string
    HelpfulCount: number
    NotHelpfulCount: number
    IsApproved: boolean
    createdAt: string
    Reviewer?: {
      data?: {
        attributes: {
          username: string
          email: string
        }
      }
    }
  }
}

interface ReviewListProps {
  listingId?: string
  itemId?: string
}

export default function ReviewList({ listingId, itemId }: ReviewListProps) {
  const t = useTranslations("reviews")
  const [reviews, setReviews] = useState<Review[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [averageRating, setAverageRating] = useState(0)
  const [ratingCounts, setRatingCounts] = useState<Record<number, number>>({})

  const fetchReviews = async () => {
    try {
      const filters = []
      if (listingId) filters.push(`filters[Listing][id][$eq]=${listingId}`)
      if (itemId) filters.push(`filters[Item][id][$eq]=${itemId}`)
      filters.push(`filters[IsApproved][$eq]=true`)
      
      const response = await fetch(
        `/api/reviews?${filters.join('&')}&populate[Reviewer]=true&sort[0]=createdAt:desc`
      )
      
      if (response.ok) {
        const data = await response.json()
        setReviews(data.data || [])
        
        // Calculate average rating and distribution
        if (data.data && data.data.length > 0) {
          const total = data.data.reduce((sum: number, review: Review) => sum + review.attributes.Rating, 0)
          setAverageRating(total / data.data.length)
          
          const counts: Record<number, number> = {}
          data.data.forEach((review: Review) => {
            counts[review.attributes.Rating] = (counts[review.attributes.Rating] || 0) + 1
          })
          setRatingCounts(counts)
        }
      }
    } catch (error) {
      console.error("Error fetching reviews:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchReviews()
  }, [listingId, itemId])

  const renderStars = (rating: number, size = "w-4 h-4") => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${size} ${
              star <= rating
                ? "fill-yellow-500 text-yellow-500"
                : "fill-none text-gray-300"
            }`}
          />
        ))}
      </div>
    )
  }

  const parseRichText = (richText: any[]): string => {
    if (!richText || !Array.isArray(richText)) return ""
    
    return richText
      .map(block => {
        if (block.type === "paragraph") {
          return block.children
            .map((child: any) => child.text || "")
            .join("")
        }
        return ""
      })
      .join("\n")
  }

  const handleVote = async (reviewId: string, helpful: boolean) => {
    try {
      await fetch(`/api/reviews/${reviewId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful })
      })
      fetchReviews()
    } catch (error) {
      console.error("Error voting on review:", error)
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block w-8 h-8 border-3 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with average rating */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">{t("title")}</h3>
            
            {reviews.length > 0 && (
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold">{averageRating.toFixed(1)}</div>
                {renderStars(Math.round(averageRating), "w-5 h-5")}
                <span className="text-gray-600">({reviews.length} {t("reviewCount")})</span>
              </div>
            )}
          </div>
          
          <button
            onClick={() => setShowReviewForm(!showReviewForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t("writeReview")}
          </button>
        </div>
        
        {/* Rating distribution */}
        {reviews.length > 0 && (
          <div className="mt-6 space-y-2">
            {[5, 4, 3, 2, 1].map(rating => {
              const count = ratingCounts[rating] || 0
              const percentage = (count / reviews.length) * 100
              
              return (
                <div key={rating} className="flex items-center gap-3">
                  <span className="text-sm w-4">{rating}</span>
                  <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                  <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-yellow-500 h-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 w-12 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      
      {/* Review form */}
      {showReviewForm && (
        <ReviewForm
          listingId={listingId}
          itemId={itemId}
          onSuccess={() => {
            setShowReviewForm(false)
            fetchReviews()
          }}
          onCancel={() => setShowReviewForm(false)}
        />
      )}
      
      {/* Reviews list */}
      {reviews.length === 0 ? (
        <p className="text-gray-500 text-center py-8">{t("noReviews")}</p>
      ) : (
        <div className="space-y-4">
          {reviews.map(review => (
            <div key={review.id} className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="w-7 h-7 text-gray-600" />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {review.attributes.Reviewer?.data?.attributes.username || t("anonymous")}
                        </span>
                        {review.attributes.Reviewer?.data && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        {renderStars(review.attributes.Rating)}
                        <span className="text-sm text-gray-500">
                          {formatDistanceToNow(new Date(review.attributes.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <h4 className="font-semibold text-gray-900 mb-2">{review.attributes.Title}</h4>
                  <p className="text-gray-700 whitespace-pre-wrap mb-4">
                    {parseRichText(review.attributes.Description)}
                  </p>
                  
                  {/* Pros and Cons */}
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    {review.attributes.Pros && (
                      <div>
                        <h5 className="font-medium text-green-700 mb-1">{t("pros")}</h5>
                        <p className="text-sm text-gray-600">{review.attributes.Pros}</p>
                      </div>
                    )}
                    {review.attributes.Cons && (
                      <div>
                        <h5 className="font-medium text-red-700 mb-1">{t("cons")}</h5>
                        <p className="text-sm text-gray-600">{review.attributes.Cons}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Helpful votes */}
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-600">{t("wasThisHelpful")}</span>
                    <button
                      onClick={() => handleVote(review.id, true)}
                      className="flex items-center gap-1 text-gray-600 hover:text-green-600 transition-colors"
                    >
                      <ThumbsUp className="w-4 h-4" />
                      <span>({review.attributes.HelpfulCount})</span>
                    </button>
                    <button
                      onClick={() => handleVote(review.id, false)}
                      className="flex items-center gap-1 text-gray-600 hover:text-red-600 transition-colors"
                    >
                      <ThumbsDown className="w-4 h-4" />
                      <span>({review.attributes.NotHelpfulCount})</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 